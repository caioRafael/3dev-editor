import Module, {
  type CrossSection,
  type JoinType,
  type Manifold,
  type ManifoldToplevel,
  type Vec2 as ManifoldVec2
} from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { boundsSize, isNearlyOne, maxEdgeRadius, resizeScale } from '../document/math'
import {
  type BooleanKind,
  type Extrusion,
  type FeatureNode,
  type OffsetNode,
  type ProfileNode,
  type ProjectDocument,
  type Transform,
  type Vec3,
  hasFlatForm,
  hasOwnExtrusion,
  isBooleanNode,
  isGroupEnabled,
  isComponentNode,
  isCuboidNode,
  isCylinderNode,
  isGroupNode,
  isHull2dNode,
  isHullNode,
  isMinkowskiNode,
  isMirrorNode,
  isOffsetNode,
  isProfileNode,
  isProjectionNode,
  isResizeNode,
  isRevolveNode,
  isSphereNode,
  isSvgNode
} from '../document/types'
import { extrusionDivisions, type ContourSet } from './contours'

export interface SolidMeshData {
  positions: Float32Array
  indices: Uint32Array
}

let wasmPromise: Promise<ManifoldToplevel> | null = null

export function getManifold(): Promise<ManifoldToplevel> {
  if (!wasmPromise) {
    wasmPromise = Module({ locateFile: () => wasmUrl }).then((api) => {
      api.setup()
      return api
    })
  }
  return wasmPromise
}

export async function buildBooleanMesh(
  document: ProjectDocument,
  nodeId: string,
  roundEdges = true,
  contours: Record<string, ContourSet> = {},
  fileName = document.activeFile
): Promise<SolidMeshData | null> {
  const node = document.files[fileName]?.nodes[nodeId]
  if (!node || !isGroupNode(node)) return null
  const api = await getManifold()
  const solid = buildSolid(api, document, node, roundEdges, contours, fileName, [])
  if (!solid) return null
  try {
    return readMesh(solid)
  } finally {
    solid.delete()
  }
}

export function subtreeKey(
  document: ProjectDocument,
  node: FeatureNode,
  fileName = document.activeFile
): string {
  return JSON.stringify(serializeNode(document, node, fileName, []))
}

function serializeNode(
  document: ProjectDocument,
  node: FeatureNode,
  fileName: string,
  stack: string[]
): unknown {
  if (!node.visible) return null
  const transform = node.transform
  if (isComponentNode(node)) {
    if (stack.includes(node.componentName)) return { kind: 'component', cycle: true }
    const file = document.files[node.componentName]
    return {
      kind: 'component',
      componentName: node.componentName,
      scale: node.scale,
      transform,
      roots: file
        ? Object.values(file.nodes)
            .filter((child) => child.consumedBy === null)
            .map((child) =>
              serializeNode(document, child, node.componentName, [...stack, node.componentName])
            )
        : []
    }
  }
  if (isGroupNode(node)) {
    const nodes = document.files[fileName]?.nodes ?? {}
    return {
      kind: node.kind,
      enabled: isGroupEnabled(node),
      transform,
      rounding: isBooleanNode(node) ? node.rounding : 0,
      mode: isOffsetNode(node) ? node.mode : undefined,
      distance: isOffsetNode(node) ? node.distance : undefined,
      chamfer: isOffsetNode(node) ? node.chamfer : undefined,
      axis: isMirrorNode(node) ? node.axis : undefined,
      angle: isRevolveNode(node) ? node.angle : undefined,
      start: isRevolveNode(node) ? node.start : undefined,
      cut: isProjectionNode(node) ? node.cut : undefined,
      size: isResizeNode(node) ? node.size : undefined,
      auto: isResizeNode(node) ? node.auto : undefined,
      extrusion: hasOwnExtrusion(node) ? node.extrusion : undefined,
      fn: document.fn,
      children: node.childIds.map((id) => {
        const child = nodes[id]
        return child ? serializeNode(document, child, fileName, stack) : null
      })
    }
  }
  if (isCuboidNode(node)) {
    return {
      kind: node.kind,
      transform,
      size: node.size,
      rounding: node.rounding,
      chamfer: node.chamfer,
      fn: document.fn
    }
  }
  if (isCylinderNode(node)) {
    return {
      kind: node.kind,
      transform,
      height: node.height,
      diameter: node.diameter,
      fn: document.fn
    }
  }
  if (isProfileNode(node)) return serializeProfile(document, node, transform, fileName)
  return { kind: 'sphere', transform, diameter: node.diameter, fn: document.fn }
}

function serializeProfile(
  document: ProjectDocument,
  node: ProfileNode,
  transform: Transform,
  fileName: string
): unknown {
  const asset = isSvgNode(node) ? document.files[fileName]?.assets[node.assetId] : undefined
  return {
    kind: node.kind,
    transform,
    fn: document.fn,
    node,
    asset: asset ? checksum(asset.source) : 0
  }
}

function checksum(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

function buildSolid(
  api: ManifoldToplevel,
  document: ProjectDocument,
  node: FeatureNode,
  roundEdges: boolean,
  contours: Record<string, ContourSet>,
  ownerFile: string,
  stack: string[]
): Manifold | null {
  if (!node.visible) return null
  const segments = Math.max(8, Math.min(128, Math.round(document.fn)))
  if (isComponentNode(node))
    return buildComponentSolid(api, document, node, roundEdges, contours, stack)
  if (isCuboidNode(node)) {
    return cuboidSolid(api, node.size, node.rounding, node.chamfer, segments)
  }
  if (isCylinderNode(node)) {
    const radius = positive(node.diameter) / 2
    return api.Manifold.cylinder(positive(node.height), radius, radius, segments, true)
  }
  if (isSphereNode(node)) return api.Manifold.sphere(positive(node.diameter) / 2, segments)
  if (isProfileNode(node)) {
    return extrudeContours(api, contours[node.id], node.extrusion, segments)
  }
  if (isGroupNode(node) && !isGroupEnabled(node)) {
    return uniteParts(placedChildren(api, document, node, roundEdges, contours, ownerFile, stack))
  }
  if (isOffsetNode(node) || isHull2dNode(node) || isProjectionNode(node)) {
    const section = buildFlatSection(api, document, node, contours, ownerFile, stack, segments)
    if (!section) return null
    return extrudeSection(section, node.extrusion, segments)
  }
  if (isRevolveNode(node)) {
    return revolveChild(api, document, node, contours, ownerFile, stack, segments)
  }
  if (!isGroupNode(node)) return null
  const parts = placedChildren(api, document, node, roundEdges, contours, ownerFile, stack)
  if (parts.length === 0) return null
  if (isBooleanNode(node)) {
    let accumulator = parts[0]
    for (let index = 1; index < parts.length; index += 1) {
      const next = combine(node.kind, accumulator, parts[index])
      accumulator.delete()
      parts[index].delete()
      accumulator = next
    }
    if (!roundEdges || node.rounding <= 0) return accumulator
    return roundSolid(api, accumulator, node.rounding)
  }
  if (isHullNode(node)) {
    const solid = api.Manifold.hull(parts)
    releaseAll(parts, solid)
    return solid
  }
  if (isMirrorNode(node)) {
    const normal = node.axis === 'x' ? [1, 0, 0] : node.axis === 'y' ? [0, 1, 0] : [0, 0, 1]
    const mirrored = parts[0].mirror(normal as [number, number, number])
    release(parts[0], mirrored)
    return mirrored
  }
  if (isResizeNode(node)) {
    const box = parts[0].boundingBox()
    const current = boundsSize({
      min: { x: box.min[0], y: box.min[1], z: box.min[2] },
      max: { x: box.max[0], y: box.max[1], z: box.max[2] }
    })
    const factor = resizeScale(current, node.size, node.auto)
    const resized = parts[0].scale([factor.x, factor.y, factor.z])
    release(parts[0], resized)
    return resized
  }
  if (isMinkowskiNode(node)) {
    let accumulator = parts[0]
    for (let index = 1; index < parts.length; index += 1) {
      const next = accumulator.minkowskiSum(parts[index])
      release(accumulator, next)
      release(parts[index], next)
      accumulator = next
    }
    return accumulator
  }
  releaseAll(parts, null)
  return null
}

function placedChildren(
  api: ManifoldToplevel,
  document: ProjectDocument,
  node: FeatureNode,
  roundEdges: boolean,
  contours: Record<string, ContourSet>,
  ownerFile: string,
  stack: string[]
): Manifold[] {
  if (!isGroupNode(node)) return []
  const nodes = document.files[ownerFile]?.nodes ?? {}
  const parts: Manifold[] = []
  for (const childId of node.childIds) {
    const child = nodes[childId]
    if (!child?.visible) continue
    const childSolid = buildSolid(api, document, child, roundEdges, contours, ownerFile, stack)
    if (!childSolid) continue
    parts.push(place(childSolid, child.transform))
  }
  return parts
}

function buildComponentSolid(
  api: ManifoldToplevel,
  document: ProjectDocument,
  node: FeatureNode & { kind: 'component' },
  roundEdges: boolean,
  contours: Record<string, ContourSet>,
  stack: string[]
): Manifold | null {
  if (stack.includes(node.componentName)) return null
  const file = document.files[node.componentName]
  if (!file) return null
  const nextStack = [...stack, node.componentName]
  const parts: Manifold[] = []
  for (const root of Object.values(file.nodes)) {
    if (root.consumedBy || !root.visible) continue
    const solid = buildSolid(
      api,
      document,
      root,
      roundEdges,
      contours,
      node.componentName,
      nextStack
    )
    if (!solid) continue
    parts.push(place(solid, root.transform))
  }
  if (parts.length === 0) return null
  let accumulator = parts[0]
  for (let index = 1; index < parts.length; index += 1) {
    const next = combine('union', accumulator, parts[index])
    accumulator.delete()
    parts[index].delete()
    accumulator = next
  }
  return scaleSolid(accumulator, node.scale)
}

function scaleSolid(solid: Manifold, scale: Vec3): Manifold {
  if (isNearlyOne(scale)) return solid
  const scaled = solid.scale([Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)])
  if (scaled !== solid) solid.delete()
  return scaled
}

function place(solid: Manifold, transform: Transform): Manifold {
  const rotated = solid.rotate([transform.rotation.x, transform.rotation.y, transform.rotation.z])
  if (rotated !== solid) solid.delete()
  const moved = rotated.translate([
    transform.position.x,
    transform.position.y,
    transform.position.z
  ])
  if (moved !== rotated) rotated.delete()
  return moved
}

function uniteParts(parts: Manifold[]): Manifold | null {
  if (parts.length === 0) return null
  let accumulator = parts[0]
  for (let index = 1; index < parts.length; index += 1) {
    const next = combine('union', accumulator, parts[index])
    accumulator.delete()
    parts[index].delete()
    accumulator = next
  }
  return accumulator
}

function combine(kind: BooleanKind, target: Manifold, tool: Manifold): Manifold {
  if (kind === 'union') return target.add(tool)
  if (kind === 'difference') return target.subtract(tool)
  return target.intersect(tool)
}

export async function buildProfileMesh(
  contours: ContourSet,
  extrusion: Extrusion,
  segments: number
): Promise<SolidMeshData | null> {
  const api = await getManifold()
  const solid = extrudeContours(api, contours, extrusion, segments)
  if (!solid) return null
  try {
    return readMesh(solid)
  } finally {
    solid.delete()
  }
}

function revolveChild(
  api: ManifoldToplevel,
  document: ProjectDocument,
  node: FeatureNode,
  contours: Record<string, ContourSet>,
  ownerFile: string,
  stack: string[],
  segments: number
): Manifold | null {
  if (!isRevolveNode(node)) return null
  const child = document.files[ownerFile]?.nodes[node.childIds[0] ?? '']
  if (!child?.visible || !hasFlatForm(child)) return null
  const section = buildFlatSection(api, document, child, contours, ownerFile, stack, segments)
  if (!section) return null
  const placed = placeSection(section, child.transform)
  let solid = placed.revolve(segments, node.angle)
  placed.delete()
  if (node.start !== 0) {
    const turned = solid.rotate([0, 0, node.start])
    release(solid, turned)
    solid = turned
  }
  return solid
}

function buildFlatSection(
  api: ManifoldToplevel,
  document: ProjectDocument,
  node: FeatureNode,
  contours: Record<string, ContourSet>,
  ownerFile: string,
  stack: string[],
  segments: number
): CrossSection | null {
  if (isGroupNode(node) && !isGroupEnabled(node)) {
    if (!isOffsetNode(node) && !isHull2dNode(node)) return null
    const sections = flatChildren(api, document, node, contours, ownerFile, stack, segments)
    return uniteSections(api, sections)
  }
  if (isProfileNode(node)) return sectionFromContours(api, contours[node.id])
  if (isProjectionNode(node))
    return projectChildren(api, document, node, contours, ownerFile, stack)
  if (!isOffsetNode(node) && !isHull2dNode(node)) return null
  const sections = flatChildren(api, document, node, contours, ownerFile, stack, segments)
  if (sections.length === 0) return null
  if (isHull2dNode(node)) {
    const hull = api.CrossSection.hull(sections)
    releaseSections(sections, hull)
    return hull
  }
  const united = uniteSections(api, sections)
  if (!united) return null
  return offsetSection(united, node, segments)
}

function projectChildren(
  api: ManifoldToplevel,
  document: ProjectDocument,
  node: FeatureNode,
  contours: Record<string, ContourSet>,
  ownerFile: string,
  stack: string[]
): CrossSection | null {
  if (!isProjectionNode(node)) return null
  const parts = placedChildren(api, document, node, false, contours, ownerFile, stack)
  if (parts.length === 0) return null
  let solid = parts[0]
  for (let index = 1; index < parts.length; index += 1) {
    const next = solid.add(parts[index])
    release(solid, next)
    release(parts[index], next)
    solid = next
  }
  const section = node.cut ? solid.slice(0) : solid.project()
  solid.delete()
  return section
}

function flatChildren(
  api: ManifoldToplevel,
  document: ProjectDocument,
  node: FeatureNode,
  contours: Record<string, ContourSet>,
  ownerFile: string,
  stack: string[],
  segments: number
): CrossSection[] {
  if (!isGroupNode(node)) return []
  const nodes = document.files[ownerFile]?.nodes ?? {}
  const sections: CrossSection[] = []
  for (const childId of node.childIds) {
    const child = nodes[childId]
    if (!child?.visible || !hasFlatForm(child)) continue
    const section = buildFlatSection(api, document, child, contours, ownerFile, stack, segments)
    if (!section) continue
    sections.push(placeSection(section, child.transform))
  }
  return sections
}

function sectionFromContours(
  api: ManifoldToplevel,
  contours: ContourSet | undefined
): CrossSection | null {
  if (!contours || contours.rings.length === 0) return null
  const polygons = contours.rings
    .map((ring) => ring.points.map((point): ManifoldVec2 => [point.x, point.y]))
    .filter((ring) => ring.length >= 3)
  if (polygons.length === 0) return null
  const section = new api.CrossSection(polygons, contours.fillRule)
  if (section.isEmpty()) {
    section.delete()
    return null
  }
  return section
}

function placeSection(section: CrossSection, transform: Transform): CrossSection {
  const rotated = section.rotate(transform.rotation.z)
  if (rotated !== section) section.delete()
  const moved = rotated.translate([transform.position.x, transform.position.y])
  if (moved !== rotated) rotated.delete()
  return moved
}

function offsetSection(section: CrossSection, node: OffsetNode, segments: number): CrossSection {
  const join: JoinType = node.mode === 'radius' ? 'Round' : node.chamfer ? 'Square' : 'Miter'
  const next = section.offset(node.distance, join, 100, Math.max(8, segments))
  if (next !== section) section.delete()
  return next
}

function uniteSections(api: ManifoldToplevel, sections: CrossSection[]): CrossSection | null {
  if (sections.length === 0) return null
  if (sections.length === 1) return sections[0]
  const united = api.CrossSection.union(sections)
  releaseSections(sections, united)
  return united
}

function extrudeSection(
  section: CrossSection,
  extrusion: Extrusion,
  segments: number
): Manifold | null {
  try {
    if (section.isEmpty()) return null
    const scale = positiveScale(extrusion.scale)
    return section.extrude(
      positive(extrusion.height),
      extrusionDivisions(extrusion, segments),
      extrusion.twist,
      [scale, scale],
      true
    )
  } finally {
    section.delete()
  }
}

function releaseSections(sections: CrossSection[], result: CrossSection | null): void {
  for (const section of sections) {
    if (section !== result) section.delete()
  }
}

function releaseAll(parts: Manifold[], result: Manifold | null): void {
  for (const part of parts) {
    if (part !== result) part.delete()
  }
}

function extrudeContours(
  api: ManifoldToplevel,
  contours: ContourSet | undefined,
  extrusion: Extrusion,
  segments: number
): Manifold | null {
  if (!contours || contours.rings.length === 0) return null
  const polygons = contours.rings
    .map((ring) => ring.points.map((point): ManifoldVec2 => [point.x, point.y]))
    .filter((ring) => ring.length >= 3)
  if (polygons.length === 0) return null
  const section = new api.CrossSection(polygons, contours.fillRule)
  try {
    if (section.isEmpty()) return null
    const scale = positiveScale(extrusion.scale)
    // A numeric scale is read as a partial vector and collapses Y.
    return section.extrude(
      positive(extrusion.height),
      extrusionDivisions(extrusion, segments),
      extrusion.twist,
      [scale, scale],
      true
    )
  } finally {
    section.delete()
  }
}

function positiveScale(value: number): number {
  return Math.max(0, value)
}

export async function buildCuboidMesh(
  size: Vec3,
  rounding: number,
  chamfer: number,
  segments: number
): Promise<SolidMeshData> {
  const api = await getManifold()
  const solid = cuboidSolid(api, size, rounding, chamfer, segments)
  try {
    return readMesh(solid)
  } finally {
    solid.delete()
  }
}

function readMesh(solid: Manifold): SolidMeshData {
  const mesh = solid.getMesh()
  const stride = Math.max(3, mesh.numProp)
  const source = mesh.vertProperties
  const count = Math.floor(source.length / stride)
  const positions = new Float32Array(count * 3)
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = source[index * stride]
    positions[index * 3 + 1] = source[index * stride + 1]
    positions[index * 3 + 2] = source[index * stride + 2]
  }
  return { positions, indices: new Uint32Array(mesh.triVerts) }
}

function cuboidSolid(
  api: ManifoldToplevel,
  size: Vec3,
  rounding: number,
  chamfer: number,
  segments: number
): Manifold {
  const width = positive(size.x)
  const depth = positive(size.y)
  const height = positive(size.z)
  const limit = maxEdgeRadius({ x: width, y: depth, z: height })
  const radius = Math.min(limit, Math.max(0, rounding))
  const bevel = rounding > 0 ? 0 : Math.min(limit, Math.max(0, chamfer))
  if (radius > 0) return roundedCuboid(api, width, depth, height, radius, segments)
  if (bevel > 0) return chamferedCuboid(api, width, depth, height, bevel)
  return api.Manifold.cube([width, depth, height], true)
}

function roundedCuboid(
  api: ManifoldToplevel,
  width: number,
  depth: number,
  height: number,
  radius: number,
  segments: number
): Manifold {
  const core = api.Manifold.cube(
    [inset(width, radius), inset(depth, radius), inset(height, radius)],
    true
  )
  const ball = api.Manifold.sphere(radius, Math.max(8, segments))
  const solid = core.minkowskiSum(ball)
  release(core, solid)
  release(ball, solid)
  return solid
}

function chamferedCuboid(
  api: ManifoldToplevel,
  width: number,
  depth: number,
  height: number,
  chamfer: number
): Manifold {
  const alongX = api.Manifold.cube([width, inset(depth, chamfer), inset(height, chamfer)], true)
  const alongY = api.Manifold.cube([inset(width, chamfer), depth, inset(height, chamfer)], true)
  const alongZ = api.Manifold.cube([inset(width, chamfer), inset(depth, chamfer), height], true)
  const solid = api.Manifold.hull([alongX, alongY, alongZ])
  release(alongX, solid)
  release(alongY, solid)
  release(alongZ, solid)
  return solid
}

function inset(size: number, radius: number): number {
  return Math.max(0.001, size - radius * 2)
}

const ROUNDING_SAMPLES = 12

function roundSolid(api: ManifoldToplevel, solid: Manifold, radius: number): Manifold {
  const ball = api.Manifold.sphere(radius, ROUNDING_SAMPLES)
  const wide = api.Manifold.sphere(radius * 2, ROUNDING_SAMPLES)
  let current = solid
  let settled = false
  try {
    const dilated = current.minkowskiSum(ball)
    release(current, dilated)
    current = dilated
    const eroded = current.minkowskiDifference(wide)
    release(current, eroded)
    current = eroded
    if (current.isEmpty()) throw new Error('O arredondamento é grande demais para essa peça.')
    const finished = current.minkowskiSum(ball)
    release(current, finished)
    current = finished
    if (current.isEmpty()) throw new Error('O arredondamento é grande demais para essa peça.')
    settled = true
    return current
  } finally {
    ball.delete()
    wide.delete()
    if (!settled) current.delete()
  }
}

function release(source: Manifold, result: Manifold): void {
  if (source !== result) source.delete()
}

function positive(value: number): number {
  return Math.max(0.001, value)
}
