import {
  booleanRadiusLimit,
  composeTransform,
  isNearlyOne,
  localBounds,
  maxEdgeRadius,
  round3,
  roundVec,
  scaleVec
} from './math'
import { readSvgMetrics, roundVec2, svgCenter } from '../preview/svgMetrics'
import {
  type BooleanKind,
  type BooleanNode,
  type CircleNode,
  type CuboidNode,
  type CylinderNode,
  type EllipseNode,
  type Extrusion,
  type FeatureNode,
  type FeaturePatch,
  type NgonNode,
  type PrimitiveKind,
  type ProfileNode,
  type ProjectDocument,
  type RectNode,
  type ShapeProfileKind,
  type SphereNode,
  type StarNode,
  type SvgAsset,
  type SvgNode,
  type TextHalign,
  type TextNode,
  type TextValign,
  type Transform,
  type Vec2,
  type Vec3,
  DEFAULT_FONT,
  MIN_SIZE,
  defaultExtrusion,
  identityTransform,
  isBooleanNode,
  isCircleNode,
  isCuboidNode,
  isCylinderNode,
  isEllipseNode,
  isNgonNode,
  isProfileNode,
  isRectNode,
  isSphereNode,
  isStarNode,
  isSvgNode,
  isTextNode
} from './types'

const PALETTE = ['#d97757', '#5b8def', '#6fbf73', '#e0b44f', '#b07cc6', '#4fb6c4']

const LABELS: Record<PrimitiveKind | BooleanKind | ShapeProfileKind | 'svg', string> = {
  cuboid: 'Cubo',
  cylinder: 'Cilindro',
  sphere: 'Esfera',
  union: 'União',
  difference: 'Diferença',
  intersection: 'Interseção',
  rect: 'Retângulo',
  circle: 'Círculo',
  ellipse: 'Elipse',
  ngon: 'Polígono',
  star: 'Estrela',
  text: 'Texto',
  svg: 'SVG'
}

const TEXT_ALIGNS_H: TextHalign[] = ['left', 'center', 'right']
const TEXT_ALIGNS_V: TextValign[] = ['top', 'center', 'baseline', 'bottom']

export interface CreatedNode {
  document: ProjectDocument
  id: string
  name: string
}

export interface BooleanResult {
  document: ProjectDocument
  id: string | null
  error: string | null
}

export function createEmptyDocument(name = 'Sem título'): ProjectDocument {
  return { version: 1, name, units: 'mm', fn: 48, nodes: {}, assets: {} }
}

export function referencedSvgAssets(document: ProjectDocument): { id: string; source: string }[] {
  const ids = new Set<string>()
  for (const node of Object.values(document.nodes)) {
    if (isSvgNode(node)) ids.add(node.assetId)
  }
  return [...ids].flatMap((id) => {
    const asset = document.assets[id]
    return asset ? [{ id: asset.id, source: asset.source }] : []
  })
}

export function getRoots(document: ProjectDocument): FeatureNode[] {
  return Object.values(document.nodes).filter((node) => node.consumedBy === null)
}

export function createPrimitive(document: ProjectDocument, kind: PrimitiveKind): CreatedNode {
  const id = crypto.randomUUID()
  const name = nextName(document, LABELS[kind])
  const transform = identityTransform()
  transform.position.x = getRoots(document).length * 24
  const appearance = {
    color: PALETTE[Object.keys(document.nodes).length % PALETTE.length],
    opacity: 1
  }
  const shared = {
    id,
    name,
    visible: true,
    locked: false,
    consumedBy: null,
    transform,
    appearance
  }
  const node = createPrimitiveNode(kind, shared)
  return {
    document: { ...document, nodes: { ...document.nodes, [id]: node } },
    id,
    name
  }
}

export function createProfile(document: ProjectDocument, kind: ShapeProfileKind): CreatedNode {
  const id = crypto.randomUUID()
  const name = nextName(document, LABELS[kind])
  const node = createProfileNode(kind, featureShell(document, id, name))
  return {
    document: { ...document, nodes: { ...document.nodes, [id]: node } },
    id,
    name
  }
}

export interface SvgImportResult {
  document: ProjectDocument
  id: string | null
  name: string | null
  error: string | null
}

export function createSvgProfile(
  document: ProjectDocument,
  fileName: string,
  source: string
): SvgImportResult {
  const metrics = readSvgMetrics(source)
  if (!metrics) {
    return {
      document,
      id: null,
      name: null,
      error: 'O SVG precisa de um viewBox ou de largura e altura.'
    }
  }
  const id = crypto.randomUUID()
  const assetId = crypto.randomUUID()
  const name = nextName(document, LABELS.svg)
  const importScale = 1
  const viewMin = roundVec2(metrics.viewMin)
  const viewSize = roundVec2(metrics.viewSize)
  const node: SvgNode = {
    ...featureShell(document, id, name),
    kind: 'svg',
    extrusion: defaultExtrusion(),
    assetId,
    importScale,
    mmPerUnit: metrics.mmPerUnit,
    viewMin,
    viewSize,
    center: roundVec2(svgCenter(viewMin, viewSize, metrics.mmPerUnit, importScale))
  }
  const asset: SvgAsset = { id: assetId, name: fileName, kind: 'svg', source }
  return {
    document: {
      ...document,
      nodes: { ...document.nodes, [id]: node },
      assets: { ...document.assets, [assetId]: asset }
    },
    id,
    name,
    error: null
  }
}

export function createBoolean(
  document: ProjectDocument,
  kind: BooleanKind,
  selectedIds: string[]
): BooleanResult {
  const unique = [...new Set(selectedIds)].filter((id) => document.nodes[id])
  if (unique.length < 2) {
    return { document, id: null, error: 'Selecione pelo menos dois sólidos.' }
  }
  if (unique.some((id) => document.nodes[id].consumedBy)) {
    return { document, id: null, error: 'Um sólido já faz parte de outra operação.' }
  }
  for (const id of unique) {
    for (const other of unique) {
      if (id !== other && isAncestor(document, id, other)) {
        return { document, id: null, error: 'Não é possível agrupar um sólido com um ancestral.' }
      }
    }
  }

  const centroid = averagePosition(unique.map((id) => document.nodes[id].transform.position))
  const id = crypto.randomUUID()
  const name = nextName(document, LABELS[kind])
  const booleanNode: BooleanNode = {
    id,
    name,
    kind,
    visible: true,
    locked: false,
    consumedBy: null,
    childIds: unique,
    rounding: 0,
    transform: { position: centroid, rotation: { x: 0, y: 0, z: 0 } },
    appearance: { ...document.nodes[unique[0]].appearance }
  }
  const nodes: Record<string, FeatureNode> = { ...document.nodes, [id]: booleanNode }
  for (const childId of unique) {
    const child = nodes[childId]
    nodes[childId] = {
      ...child,
      consumedBy: id,
      transform: {
        rotation: child.transform.rotation,
        position: {
          x: round3(child.transform.position.x - centroid.x),
          y: round3(child.transform.position.y - centroid.y),
          z: round3(child.transform.position.z - centroid.z)
        }
      }
    }
  }
  return { document: { ...document, nodes }, id, error: null }
}

export function deleteNodes(document: ProjectDocument, ids: string[]): ProjectDocument {
  const remove = new Set<string>()
  const visit = (id: string): void => {
    if (remove.has(id) || !document.nodes[id]) return
    remove.add(id)
    const node = document.nodes[id]
    if (isBooleanNode(node)) node.childIds.forEach(visit)
  }
  ids.forEach(visit)

  let nodes: Record<string, FeatureNode> = { ...document.nodes }
  for (const id of remove) {
    const node = nodes[id]
    const parentId = node.consumedBy
    if (!parentId || remove.has(parentId)) continue
    const parent = asBoolean(nodes[parentId])
    if (!parent) continue
    nodes[parentId] = { ...parent, childIds: parent.childIds.filter((childId) => childId !== id) }
  }
  for (const id of remove) {
    const next = { ...nodes }
    delete next[id]
    nodes = next
  }
  return pruneAssets({ ...document, nodes: repairBooleans(nodes) })
}

export function patchNode(
  document: ProjectDocument,
  id: string,
  patch: FeaturePatch
): ProjectDocument {
  const node = document.nodes[id]
  if (!node) return document
  let next: FeatureNode = {
    ...node,
    name: patch.name ?? node.name,
    visible: patch.visible ?? node.visible,
    locked: patch.locked ?? node.locked,
    transform: patch.transform ? roundTransform(patch.transform) : node.transform,
    appearance: patch.appearance ?? node.appearance
  }
  if (isCuboidNode(next) && isCuboidNode(node)) {
    let rounding = patch.rounding ?? node.rounding
    let chamfer = patch.chamfer ?? node.chamfer
    if (patch.rounding !== undefined && patch.rounding > 0) chamfer = 0
    if (patch.chamfer !== undefined && patch.chamfer > 0) rounding = 0
    const size = sanitizeSize(patch.size ?? node.size)
    const limit = maxEdgeRadius(size)
    next = {
      ...next,
      size,
      rounding: Math.min(limit, Math.max(0, rounding)),
      chamfer: Math.min(limit, Math.max(0, chamfer))
    }
  }
  if (isCylinderNode(next) && isCylinderNode(node)) {
    next = {
      ...next,
      height: positive(patch.height ?? node.height),
      diameter: positive(patch.diameter ?? node.diameter)
    }
  }
  if (isSphereNode(next) && isSphereNode(node)) {
    next = { ...next, diameter: positive(patch.diameter ?? node.diameter) }
  }
  if (isBooleanNode(next) && isBooleanNode(node)) {
    const rounding = Math.max(0, patch.rounding ?? node.rounding)
    const limit = booleanRadiusLimit(localBounds(document, node))
    next = { ...next, rounding: Math.min(limit, rounding) }
  }
  if (isProfileNode(next)) {
    next = patchProfile(next, patch)
  }
  return { ...document, nodes: { ...document.nodes, [id]: next } }
}

export function setNodeTransform(
  document: ProjectDocument,
  id: string,
  transform: Transform
): ProjectDocument {
  return patchNode(document, id, { transform: roundTransform(transform) })
}

export function bakeScale(document: ProjectDocument, id: string, scale: Vec3): ProjectDocument {
  const node = document.nodes[id]
  if (!node || isNearlyOne(scale)) return document
  const ids = isBooleanNode(node) ? [id, ...collectDescendants(node, document.nodes)] : [id]
  const nodes = { ...document.nodes }
  for (const targetId of ids) {
    const target = nodes[targetId]
    const position =
      isBooleanNode(node) && targetId !== id
        ? roundVec(scaleVec(target.transform.position, scale))
        : target.transform.position
    const moved = { ...target, transform: { ...target.transform, position } }
    nodes[targetId] = applyDimensionScale(moved, scale)
  }
  return { ...document, nodes }
}

export function collectDescendants(
  node: BooleanNode,
  nodes: Record<string, FeatureNode>
): string[] {
  const ids: string[] = []
  const walk = (current: BooleanNode): void => {
    for (const childId of current.childIds) {
      const child = nodes[childId]
      if (!child) continue
      ids.push(childId)
      if (isBooleanNode(child)) walk(child)
    }
  }
  walk(node)
  return ids
}

export function pruneAssets(document: ProjectDocument): ProjectDocument {
  const used = new Set<string>()
  for (const node of Object.values(document.nodes)) {
    if (isSvgNode(node)) used.add(node.assetId)
  }
  const assets: Record<string, SvgAsset> = {}
  for (const [id, asset] of Object.entries(document.assets)) {
    if (used.has(id)) assets[id] = asset
  }
  if (Object.keys(assets).length === Object.keys(document.assets).length) return document
  return { ...document, assets }
}

function featureShell(
  document: ProjectDocument,
  id: string,
  name: string
): Omit<RectNode, 'kind' | 'size' | 'rounding' | 'chamfer' | 'extrusion'> {
  const transform = identityTransform()
  transform.position.x = getRoots(document).length * 24
  return {
    id,
    name,
    visible: true,
    locked: false,
    consumedBy: null,
    transform,
    appearance: {
      color: PALETTE[Object.keys(document.nodes).length % PALETTE.length],
      opacity: 1
    }
  }
}

function createProfileNode(
  kind: ShapeProfileKind,
  shared: Omit<RectNode, 'kind' | 'size' | 'rounding' | 'chamfer' | 'extrusion'>
): ProfileNode {
  const extrusion = defaultExtrusion()
  if (kind === 'rect') {
    const node: RectNode = {
      ...shared,
      kind: 'rect',
      size: { x: 20, y: 12 },
      rounding: 0,
      chamfer: 0,
      extrusion
    }
    return node
  }
  if (kind === 'circle') {
    const node: CircleNode = { ...shared, kind: 'circle', diameter: 16, extrusion }
    return node
  }
  if (kind === 'ellipse') {
    const node: EllipseNode = {
      ...shared,
      kind: 'ellipse',
      diameter: { x: 20, y: 12 },
      extrusion
    }
    return node
  }
  if (kind === 'ngon') {
    const node: NgonNode = {
      ...shared,
      kind: 'ngon',
      sides: 6,
      diameter: 16,
      rounding: 0,
      extrusion
    }
    return node
  }
  if (kind === 'star') {
    const node: StarNode = {
      ...shared,
      kind: 'star',
      points: 5,
      diameter: 18,
      innerDiameter: 8,
      extrusion
    }
    return node
  }
  const node: TextNode = {
    ...shared,
    kind: 'text',
    text: 'Texto',
    size: 10,
    font: DEFAULT_FONT,
    halign: 'center',
    valign: 'center',
    extrusion
  }
  return node
}

function patchProfile(node: ProfileNode, patch: FeaturePatch): ProfileNode {
  const extrusion = sanitizeExtrusion(patch.extrusion ?? node.extrusion)
  if (isRectNode(node)) {
    const size = positiveVec2(patch.size2 ?? node.size)
    let rounding = patch.rounding ?? node.rounding
    let chamfer = patch.chamfer ?? node.chamfer
    if (patch.rounding !== undefined && patch.rounding > 0) chamfer = 0
    if (patch.chamfer !== undefined && patch.chamfer > 0) rounding = 0
    const limit = cornerLimit(Math.min(size.x, size.y))
    return {
      ...node,
      extrusion,
      size,
      rounding: Math.min(limit, Math.max(0, rounding)),
      chamfer: Math.min(limit, Math.max(0, chamfer))
    }
  }
  if (isCircleNode(node)) {
    return { ...node, extrusion, diameter: positive(patch.diameter ?? node.diameter) }
  }
  if (isEllipseNode(node)) {
    return { ...node, extrusion, diameter: positiveVec2(patch.diameter2 ?? node.diameter) }
  }
  if (isNgonNode(node)) {
    const sides = clampInt(patch.sides ?? node.sides, 3, 32)
    const diameter = positive(patch.diameter ?? node.diameter)
    const limit = ngonRoundingLimit(diameter, sides)
    return {
      ...node,
      extrusion,
      sides,
      diameter,
      rounding: round3(Math.min(limit, Math.max(0, patch.rounding ?? node.rounding)))
    }
  }
  if (isStarNode(node)) {
    const points = clampInt(patch.points ?? node.points, 3, 32)
    const diameter = positive(patch.diameter ?? node.diameter)
    const inner = Math.max(0.05, patch.innerDiameter ?? node.innerDiameter)
    return {
      ...node,
      extrusion,
      points,
      diameter,
      innerDiameter: round3(Math.min(inner, Math.max(0.05, diameter - 0.05)))
    }
  }
  if (isTextNode(node)) {
    const source = patch.text ?? patch.name
    const requested = source === undefined ? node.text : source.replace(/\s+/g, ' ').trim()
    const halign = alignH(patch.halign) ?? node.halign
    const valign = alignV(patch.valign) ?? node.valign
    return {
      ...node,
      extrusion,
      text: requested.length > 0 ? requested : node.text,
      size: positive(patch.textSize ?? node.size),
      font: (patch.font ?? node.font).trim() || DEFAULT_FONT,
      halign,
      valign
    }
  }
  const importScale = round3(Math.min(100, Math.max(0.001, patch.importScale ?? node.importScale)))
  const center =
    patch.importScale === undefined
      ? node.center
      : roundVec2(svgCenter(node.viewMin, node.viewSize, node.mmPerUnit, importScale))
  return { ...node, extrusion, importScale, center }
}

function scaleProfile(node: ProfileNode, scale: Vec3): ProfileNode {
  const extrusion = { ...node.extrusion, height: scaledSize(node.extrusion.height, scale.z) }
  const planar = (Math.abs(scale.x) + Math.abs(scale.y)) / 2
  if (isRectNode(node)) {
    const size = {
      x: scaledSize(node.size.x, scale.x),
      y: scaledSize(node.size.y, scale.y)
    }
    const limit = cornerLimit(Math.min(size.x, size.y))
    return {
      ...node,
      size,
      extrusion,
      rounding: round3(Math.min(limit, node.rounding * planar)),
      chamfer: round3(Math.min(limit, node.chamfer * planar))
    }
  }
  if (isCircleNode(node)) return { ...node, extrusion, diameter: scaledSize(node.diameter, planar) }
  if (isEllipseNode(node)) {
    return {
      ...node,
      extrusion,
      diameter: {
        x: scaledSize(node.diameter.x, scale.x),
        y: scaledSize(node.diameter.y, scale.y)
      }
    }
  }
  if (isNgonNode(node)) {
    const diameter = scaledSize(node.diameter, planar)
    const limit = ngonRoundingLimit(diameter, node.sides)
    return {
      ...node,
      extrusion,
      diameter,
      rounding: round3(Math.min(limit, node.rounding * planar))
    }
  }
  if (isStarNode(node)) {
    const diameter = scaledSize(node.diameter, planar)
    return {
      ...node,
      extrusion,
      diameter,
      innerDiameter: round3(Math.min(scaledSize(node.innerDiameter, planar), diameter - 0.05))
    }
  }
  if (isTextNode(node)) return { ...node, extrusion, size: scaledSize(node.size, planar) }
  const importScale = round3(Math.max(0.001, node.importScale * planar))
  return {
    ...node,
    extrusion,
    importScale,
    center: roundVec2(svgCenter(node.viewMin, node.viewSize, node.mmPerUnit, importScale))
  }
}

function sanitizeExtrusion(extrusion: Extrusion): Extrusion {
  return {
    height: positive(extrusion.height),
    twist: round3(extrusion.twist),
    scale: round3(Math.min(100, Math.max(0, extrusion.scale)))
  }
}

function positiveVec2(value: Vec2): Vec2 {
  return { x: positive(value.x), y: positive(value.y) }
}

function cornerLimit(span: number): number {
  return round3(Math.max(0, span / 2 - 0.001))
}

function ngonRoundingLimit(diameter: number, sides: number): number {
  return round3(Math.max(0, (diameter / 2) * Math.sin(Math.PI / sides) - 0.001))
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function alignH(value: TextHalign | undefined): TextHalign | null {
  if (!value) return null
  return TEXT_ALIGNS_H.includes(value) ? value : null
}

function alignV(value: TextValign | undefined): TextValign | null {
  if (!value) return null
  return TEXT_ALIGNS_V.includes(value) ? value : null
}

function createPrimitiveNode(
  kind: PrimitiveKind,
  shared: Omit<CuboidNode, 'kind' | 'size' | 'rounding' | 'chamfer'>
): FeatureNode {
  if (kind === 'cuboid') {
    const node: CuboidNode = {
      ...shared,
      kind: 'cuboid',
      size: { x: 20, y: 20, z: 20 },
      rounding: 0,
      chamfer: 0
    }
    return node
  }
  if (kind === 'cylinder') {
    const node: CylinderNode = { ...shared, kind: 'cylinder', height: 20, diameter: 12 }
    return node
  }
  const node: SphereNode = { ...shared, kind: 'sphere', diameter: 16 }
  return node
}

function repairBooleans(nodes: Record<string, FeatureNode>): Record<string, FeatureNode> {
  let current = { ...nodes }
  let changed = true
  while (changed) {
    changed = false
    for (const node of Object.values(current)) {
      const booleanNode = asBoolean(node)
      if (!booleanNode) continue
      const existing = booleanNode.childIds.filter((childId) => current[childId])
      if (existing.length >= 2 && existing.length === booleanNode.childIds.length) continue
      changed = true
      if (existing.length === 1) {
        const child = current[existing[0]]
        current[child.id] = {
          ...child,
          consumedBy: booleanNode.consumedBy,
          transform: composeTransform(booleanNode.transform, child.transform)
        }
        const parent = booleanNode.consumedBy ? asBoolean(current[booleanNode.consumedBy]) : null
        if (parent) {
          current[parent.id] = {
            ...parent,
            childIds: parent.childIds.map((childId) =>
              childId === booleanNode.id ? child.id : childId
            )
          }
        }
      } else if (existing.length === 0 && booleanNode.consumedBy) {
        const parent = asBoolean(current[booleanNode.consumedBy])
        if (parent) {
          current[parent.id] = {
            ...parent,
            childIds: parent.childIds.filter((childId) => childId !== booleanNode.id)
          }
        }
      }
      const next = { ...current }
      delete next[booleanNode.id]
      current = next
      break
    }
  }
  return current
}

function applyDimensionScale(node: FeatureNode, scale: Vec3): FeatureNode {
  if (isCuboidNode(node)) {
    return {
      ...node,
      size: {
        x: scaledSize(node.size.x, scale.x),
        y: scaledSize(node.size.y, scale.y),
        z: scaledSize(node.size.z, scale.z)
      }
    }
  }
  if (isCylinderNode(node)) {
    const diameterFactor = (Math.abs(scale.x) + Math.abs(scale.y)) / 2
    return {
      ...node,
      diameter: scaledSize(node.diameter, diameterFactor),
      height: scaledSize(node.height, scale.z)
    }
  }
  if (isSphereNode(node)) {
    const factor = (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3
    return { ...node, diameter: scaledSize(node.diameter, factor) }
  }
  if (isBooleanNode(node)) {
    const factor = (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3
    return { ...node, rounding: round3(Math.max(0, node.rounding * factor)) }
  }
  if (isProfileNode(node)) return scaleProfile(node, scale)
  return node
}

function scaledSize(value: number, factor: number): number {
  return round3(Math.max(MIN_SIZE, value * Math.abs(factor)))
}

function positive(value: number): number {
  return round3(Math.max(MIN_SIZE, value))
}

function sanitizeSize(size: Vec3): Vec3 {
  return { x: positive(size.x), y: positive(size.y), z: positive(size.z) }
}

function roundTransform(transform: Transform): Transform {
  return { position: roundVec(transform.position), rotation: roundVec(transform.rotation) }
}

function averagePosition(points: Vec3[]): Vec3 {
  const total = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }),
    { x: 0, y: 0, z: 0 }
  )
  return roundVec({
    x: total.x / points.length,
    y: total.y / points.length,
    z: total.z / points.length
  })
}

function nextName(document: ProjectDocument, label: string): string {
  const count = Object.values(document.nodes).filter((node) => node.name.startsWith(label)).length
  return `${label} ${count + 1}`
}

function isAncestor(document: ProjectDocument, ancestorId: string, nodeId: string): boolean {
  const seen = new Set<string>()
  let current = document.nodes[nodeId]
  while (current?.consumedBy) {
    if (current.consumedBy === ancestorId) return true
    if (seen.has(current.consumedBy)) return false
    seen.add(current.consumedBy)
    current = document.nodes[current.consumedBy]
  }
  return false
}

function asBoolean(node: FeatureNode | undefined): BooleanNode | null {
  if (!node || !isBooleanNode(node)) return null
  return node
}
