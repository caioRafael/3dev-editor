import Module, {
  type Manifold,
  type ManifoldToplevel,
  type Vec2 as ManifoldVec2
} from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { maxEdgeRadius } from '../document/math'
import {
  type BooleanKind,
  type Extrusion,
  type FeatureNode,
  type ProfileNode,
  type ProjectDocument,
  type Transform,
  type Vec3,
  isBooleanNode,
  isCuboidNode,
  isCylinderNode,
  isProfileNode,
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
  contours: Record<string, ContourSet> = {}
): Promise<SolidMeshData | null> {
  const node = document.nodes[nodeId]
  if (!node || !isBooleanNode(node)) return null
  const api = await getManifold()
  const solid = buildSolid(api, document, node, roundEdges, contours)
  if (!solid) return null
  try {
    return readMesh(solid)
  } finally {
    solid.delete()
  }
}

export function subtreeKey(document: ProjectDocument, node: FeatureNode): string {
  return JSON.stringify(serializeNode(document, node))
}

function serializeNode(document: ProjectDocument, node: FeatureNode): unknown {
  if (!node.visible) return null
  const transform = node.transform
  if (isBooleanNode(node)) {
    return {
      kind: node.kind,
      transform,
      rounding: node.rounding,
      fn: document.fn,
      children: node.childIds.map((id) => {
        const child = document.nodes[id]
        return child ? serializeNode(document, child) : null
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
  if (isProfileNode(node)) return serializeProfile(document, node, transform)
  return { kind: node.kind, transform, diameter: node.diameter, fn: document.fn }
}

function serializeProfile(
  document: ProjectDocument,
  node: ProfileNode,
  transform: Transform
): unknown {
  const asset = isSvgNode(node) ? document.assets[node.assetId] : undefined
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
  contours: Record<string, ContourSet>
): Manifold | null {
  if (!node.visible) return null
  const segments = Math.max(8, Math.min(128, Math.round(document.fn)))
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
  if (!isBooleanNode(node)) return null

  const parts: Manifold[] = []
  for (const childId of node.childIds) {
    const child = document.nodes[childId]
    if (!child?.visible) continue
    const childSolid = buildSolid(api, document, child, roundEdges, contours)
    if (!childSolid) continue
    parts.push(place(childSolid, child.transform))
  }
  if (parts.length === 0) return null
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
