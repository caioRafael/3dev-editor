import {
  booleanRadiusLimit,
  boundsSize,
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
  MAIN_FILE,
  activeModel,
  emptyModel,
  introducesCycle,
  replaceActive,
  validateComponentName
} from './files'
import {
  type BooleanKind,
  type BooleanNode,
  type CircleNode,
  type ComponentInstanceNode,
  type CuboidNode,
  type CylinderNode,
  type EllipseNode,
  type Extrusion,
  type FeatureNode,
  type FeaturePatch,
  type GroupNode,
  type Hull2dNode,
  type HullNode,
  type MinkowskiNode,
  type MirrorNode,
  type NgonNode,
  type OffsetNode,
  type OperationKind,
  type OperationNode,
  type PrimitiveKind,
  type ProfileNode,
  type ProjectDocument,
  type ProjectionNode,
  type RectNode,
  type ResizeNode,
  type RevolveNode,
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
  hasFlatForm,
  hasOwnExtrusion,
  identityTransform,
  isBooleanNode,
  isCircleNode,
  isComponentNode,
  isCuboidNode,
  isCylinderNode,
  isEllipseNode,
  isGroupNode,
  isHull2dNode,
  isMirrorNode,
  isNgonNode,
  isOffsetNode,
  isOperationNode,
  isProfileNode,
  isProjectionNode,
  isRectNode,
  isResizeNode,
  isRevolveNode,
  isSphereNode,
  isStarNode,
  isSvgNode,
  isTextNode,
  operationMinimum,
  operationNeedsFlat
} from './types'

const PALETTE = ['#d97757', '#5b8def', '#6fbf73', '#e0b44f', '#b07cc6', '#4fb6c4']

const LABELS: Record<
  PrimitiveKind | BooleanKind | ShapeProfileKind | 'svg' | OperationKind,
  string
> = {
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
  svg: 'SVG',
  offset: 'Offset',
  hull2d: 'Casca 2D',
  hull: 'Casca 3D',
  mirror: 'Espelho',
  revolve: 'Revolução',
  projection: 'Projeção',
  resize: 'Redimensionar',
  minkowski: 'Minkowski'
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
  return {
    version: 2,
    name,
    units: 'mm',
    fn: 48,
    activeFile: MAIN_FILE,
    files: { [MAIN_FILE]: emptyModel() }
  }
}

export function referencedSvgAssets(document: ProjectDocument): { id: string; source: string }[] {
  const assets = new Map<string, string>()
  for (const file of Object.values(document.files)) {
    for (const node of Object.values(file.nodes)) {
      if (!isSvgNode(node)) continue
      const asset = file.assets[node.assetId]
      if (asset) assets.set(asset.id, asset.source)
    }
  }
  return [...assets].map(([id, source]) => ({ id, source }))
}

export function getRoots(document: ProjectDocument, fileName = document.activeFile): FeatureNode[] {
  const file = document.files[fileName]
  if (!file) return []
  return Object.values(file.nodes).filter((node) => node.consumedBy === null)
}

function nodesOf(document: ProjectDocument): Record<string, FeatureNode> {
  return activeModel(document).nodes
}

function assetsOf(document: ProjectDocument): Record<string, SvgAsset> {
  return activeModel(document).assets
}

function withModel(
  document: ProjectDocument,
  nodes: Record<string, FeatureNode>,
  assets: Record<string, SvgAsset> = assetsOf(document)
): ProjectDocument {
  return replaceActive(document, { nodes, assets })
}

export function createPrimitive(document: ProjectDocument, kind: PrimitiveKind): CreatedNode {
  const id = crypto.randomUUID()
  const name = nextName(document, LABELS[kind])
  const transform = identityTransform()
  transform.position.x = getRoots(document).length * 24
  const appearance = {
    color: PALETTE[Object.keys(nodesOf(document)).length % PALETTE.length],
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
    document: withModel(document, { ...nodesOf(document), [id]: node }),
    id,
    name
  }
}

export function createProfile(document: ProjectDocument, kind: ShapeProfileKind): CreatedNode {
  const id = crypto.randomUUID()
  const name = nextName(document, LABELS[kind])
  const node = createProfileNode(kind, featureShell(document, id, name))
  return {
    document: withModel(document, { ...nodesOf(document), [id]: node }),
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
    document: withModel(
      document,
      { ...nodesOf(document), [id]: node },
      { ...assetsOf(document), [assetId]: asset }
    ),
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
  const nodes = nodesOf(document)
  const unique = [...new Set(selectedIds)].filter((id) => nodes[id])
  if (unique.length < 2) {
    return { document, id: null, error: 'Selecione pelo menos dois sólidos.' }
  }
  if (unique.some((id) => nodes[id].consumedBy)) {
    return { document, id: null, error: 'Um sólido já faz parte de outra operação.' }
  }
  for (const id of unique) {
    for (const other of unique) {
      if (id !== other && isAncestor(document, id, other)) {
        return { document, id: null, error: 'Não é possível agrupar um sólido com um ancestral.' }
      }
    }
  }

  const centroid = averagePosition(unique.map((id) => nodes[id].transform.position))
  const id = crypto.randomUUID()
  const name = nextName(document, LABELS[kind])
  const booleanNode: BooleanNode = {
    id,
    name,
    kind,
    visible: true,
    locked: false,
    enabled: true,
    consumedBy: null,
    childIds: unique,
    rounding: 0,
    transform: { position: centroid, rotation: { x: 0, y: 0, z: 0 } },
    appearance: { ...nodes[unique[0]].appearance }
  }
  const nextNodes: Record<string, FeatureNode> = { ...nodes, [id]: booleanNode }
  for (const childId of unique) {
    const child = nextNodes[childId]
    nextNodes[childId] = {
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
  return { document: withModel(document, nextNodes), id, error: null }
}

const OPERATION_ERRORS: Record<OperationKind, string> = {
  offset: 'Selecione pelo menos um perfil ou uma operação 2D.',
  hull2d: 'Selecione pelo menos dois perfis ou operações 2D.',
  hull: 'Selecione pelo menos dois sólidos.',
  mirror: 'Selecione um sólido para espelhar.',
  revolve: 'Selecione um perfil ou uma operação 2D para revolucionar.',
  projection: 'Selecione pelo menos um sólido para projetar.',
  resize: 'Selecione um sólido para redimensionar.',
  minkowski: 'Selecione pelo menos dois sólidos.'
}

export function createOperation(
  document: ProjectDocument,
  kind: OperationKind,
  selectedIds: string[]
): BooleanResult {
  const nodes = nodesOf(document)
  const unique = [...new Set(selectedIds)].filter((id) => nodes[id])
  const minimum = operationMinimum(kind)
  const exact = kind === 'mirror' || kind === 'revolve' || kind === 'resize'
  if (unique.length < minimum || (exact && unique.length !== 1)) {
    return { document, id: null, error: OPERATION_ERRORS[kind] }
  }
  if (unique.some((id) => nodes[id].consumedBy)) {
    return { document, id: null, error: 'Um sólido já faz parte de outra operação.' }
  }
  for (const id of unique) {
    for (const other of unique) {
      if (id !== other && isAncestor(document, id, other)) {
        return { document, id: null, error: 'Não é possível agrupar um sólido com um ancestral.' }
      }
    }
  }
  if (operationNeedsFlat(kind) && unique.some((id) => !hasFlatForm(nodes[id]))) {
    return {
      document,
      id: null,
      error: 'Essa operação só aceita perfis, offset, casca 2D ou projeção.'
    }
  }

  const centroid = averagePosition(unique.map((id) => nodes[id].transform.position))
  const id = crypto.randomUUID()
  const name = nextName(document, LABELS[kind])
  const operation = createOperationNode(
    document,
    kind,
    unique.map((childId) => nodes[childId]),
    {
      id,
      name,
      visible: true,
      locked: false,
      enabled: true,
      consumedBy: null,
      transform: { position: centroid, rotation: { x: 0, y: 0, z: 0 } },
      appearance: { ...nodes[unique[0]].appearance }
    }
  )
  const nextNodes: Record<string, FeatureNode> = { ...nodes, [id]: operation }
  for (const childId of unique) {
    const child = nextNodes[childId]
    nextNodes[childId] = {
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
  return { document: withModel(document, nextNodes), id, error: null }
}

export function deleteNodes(document: ProjectDocument, ids: string[]): ProjectDocument {
  const current = nodesOf(document)
  const remove = new Set(ids.filter((id) => current[id]))
  let nodes: Record<string, FeatureNode> = { ...current }
  const releases = collectReleases(nodes, remove)
  const promoted = new Map<string, string[]>()
  for (const release of releases) {
    const child = nodes[release.id]
    nodes[release.id] = { ...child, consumedBy: release.parentId, transform: release.transform }
    const listed = promoted.get(release.slot) ?? []
    listed.push(release.id)
    promoted.set(release.slot, listed)
  }
  for (const node of Object.values(nodes)) {
    if (!isGroupNode(node) || remove.has(node.id)) continue
    let changed = false
    const childIds = node.childIds.flatMap((childId) => {
      if (!remove.has(childId)) return [childId]
      changed = true
      return promoted.get(childId) ?? []
    })
    if (changed) nodes = { ...nodes, [node.id]: { ...node, childIds } }
  }
  for (const id of remove) {
    const next = { ...nodes }
    delete next[id]
    nodes = next
  }
  return pruneAssets(withModel(document, repairOperations(repairBooleans(nodes))))
}

interface ReleasedChild {
  id: string
  parentId: string | null
  slot: string
  transform: Transform
}

export function groupToToggle(
  document: ProjectDocument,
  ids: string[],
  kind: BooleanKind | OperationKind
): string | null {
  const nodes = nodesOf(document)
  const unique = [...new Set(ids)].filter((id) => nodes[id])
  if (unique.length === 1) {
    const node = nodes[unique[0]]
    if (isGroupNode(node) && node.kind === kind) return node.id
  }
  if (unique.length === 0) return null
  const parentId = nodes[unique[0]].consumedBy
  if (!parentId) return null
  const parent = nodes[parentId]
  if (!parent || !isGroupNode(parent) || parent.kind !== kind) return null
  if (unique.some((id) => nodes[id].consumedBy !== parentId)) return null
  const sameChildren =
    parent.childIds.length === unique.length && parent.childIds.every((id) => unique.includes(id))
  return sameChildren ? parentId : null
}

function collectReleases(nodes: Record<string, FeatureNode>, remove: Set<string>): ReleasedChild[] {
  const releases: ReleasedChild[] = []
  const visit = (id: string, slot: string, parentId: string | null, prefix: Transform): void => {
    const node = nodes[id]
    if (!node) return
    if (!remove.has(id)) {
      releases.push({
        id,
        parentId,
        slot,
        transform: composeTransform(prefix, node.transform)
      })
      return
    }
    if (!isGroupNode(node)) return
    const nextPrefix = composeTransform(prefix, node.transform)
    node.childIds.forEach((childId) => visit(childId, slot, parentId, nextPrefix))
  }
  for (const id of remove) {
    const node = nodes[id]
    if (!node || !isGroupNode(node)) continue
    if (node.consumedBy && remove.has(node.consumedBy)) continue
    node.childIds.forEach((childId) => visit(childId, id, node.consumedBy, node.transform))
  }
  return releases
}

export function patchNode(
  document: ProjectDocument,
  id: string,
  patch: FeaturePatch
): ProjectDocument {
  const node = nodesOf(document)[id]
  if (!node) return document
  let next: FeatureNode = {
    ...node,
    name: patch.name ?? node.name,
    visible: patch.visible ?? node.visible,
    locked: patch.locked ?? node.locked,
    enabled: patch.enabled ?? node.enabled,
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
  if (isOperationNode(next) && isOperationNode(node)) {
    next = patchOperation(next, node, patch)
  }
  if (isComponentNode(next) && isComponentNode(node)) {
    next = {
      ...next,
      componentName: node.componentName,
      scale: roundVec(patch.scale ?? node.scale)
    }
  }
  if (isProfileNode(next)) {
    next = patchProfile(next, patch)
  }
  return withModel(document, { ...nodesOf(document), [id]: next })
}

export function setNodeTransform(
  document: ProjectDocument,
  id: string,
  transform: Transform
): ProjectDocument {
  return patchNode(document, id, { transform: roundTransform(transform) })
}

export function bakeScale(document: ProjectDocument, id: string, scale: Vec3): ProjectDocument {
  const node = nodesOf(document)[id]
  if (!node || isNearlyOne(scale)) return document
  const ids = isGroupNode(node) ? [id, ...collectDescendants(node, nodesOf(document))] : [id]
  const nodes = { ...nodesOf(document) }
  for (const targetId of ids) {
    const target = nodes[targetId]
    const position =
      isGroupNode(node) && targetId !== id
        ? roundVec(scaleVec(target.transform.position, scale))
        : target.transform.position
    const moved = { ...target, transform: { ...target.transform, position } }
    nodes[targetId] = applyDimensionScale(moved, scale)
  }
  return withModel(document, nodes)
}

export function collectDescendants(node: GroupNode, nodes: Record<string, FeatureNode>): string[] {
  const ids: string[] = []
  const walk = (current: GroupNode): void => {
    for (const childId of current.childIds) {
      const child = nodes[childId]
      if (!child) continue
      ids.push(childId)
      if (isGroupNode(child)) walk(child)
    }
  }
  walk(node)
  return ids
}

export function pruneAssets(document: ProjectDocument): ProjectDocument {
  const used = new Set<string>()
  for (const node of Object.values(nodesOf(document))) {
    if (isSvgNode(node)) used.add(node.assetId)
  }
  const current = assetsOf(document)
  const assets: Record<string, SvgAsset> = {}
  for (const [id, asset] of Object.entries(current)) {
    if (used.has(id)) assets[id] = asset
  }
  if (Object.keys(assets).length === Object.keys(current).length) return document
  return withModel(document, nodesOf(document), assets)
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
      color: PALETTE[Object.keys(nodesOf(document)).length % PALETTE.length],
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
        const parent = booleanNode.consumedBy ? asGroup(current[booleanNode.consumedBy]) : null
        if (parent) {
          current[parent.id] = {
            ...parent,
            childIds: parent.childIds.map((childId) =>
              childId === booleanNode.id ? child.id : childId
            )
          }
        }
      } else if (existing.length === 0 && booleanNode.consumedBy) {
        const parent = asGroup(current[booleanNode.consumedBy])
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

function repairOperations(nodes: Record<string, FeatureNode>): Record<string, FeatureNode> {
  let current = { ...nodes }
  let changed = true
  while (changed) {
    changed = false
    for (const node of Object.values(current)) {
      if (!isOperationNode(node)) continue
      const existing = node.childIds.filter((childId) => current[childId])
      const minimum = operationMinimum(node.kind)
      if (existing.length >= minimum && existing.length === node.childIds.length) continue
      changed = true
      if (existing.length >= minimum) {
        current = { ...current, [node.id]: { ...node, childIds: existing } }
        break
      }
      if (existing.length === 1) {
        const child = current[existing[0]]
        current[child.id] = {
          ...child,
          consumedBy: node.consumedBy,
          transform: composeTransform(node.transform, child.transform)
        }
        const parent = node.consumedBy ? asGroup(current[node.consumedBy]) : null
        if (parent) {
          current[parent.id] = {
            ...parent,
            childIds: parent.childIds.map((childId) => (childId === node.id ? child.id : childId))
          }
        }
      } else if (existing.length === 0 && node.consumedBy) {
        const parent = asGroup(current[node.consumedBy])
        if (parent) {
          current[parent.id] = {
            ...parent,
            childIds: parent.childIds.filter((childId) => childId !== node.id)
          }
        }
      }
      const next = { ...current }
      delete next[node.id]
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
  if (isOffsetNode(node)) {
    const planar = (Math.abs(scale.x) + Math.abs(scale.y)) / 2
    return {
      ...node,
      distance: round3(node.distance * planar),
      extrusion: { ...node.extrusion, height: scaledSize(node.extrusion.height, scale.z) }
    }
  }
  if (isHull2dNode(node) || isProjectionNode(node)) {
    return {
      ...node,
      extrusion: { ...node.extrusion, height: scaledSize(node.extrusion.height, scale.z) }
    }
  }
  if (isResizeNode(node)) {
    return {
      ...node,
      size: {
        x: round3(Math.max(0, node.size.x * Math.abs(scale.x))),
        y: round3(Math.max(0, node.size.y * Math.abs(scale.y))),
        z: round3(Math.max(0, node.size.z * Math.abs(scale.z)))
      }
    }
  }
  if (isComponentNode(node)) {
    return {
      ...node,
      scale: {
        x: round3(node.scale.x * scale.x),
        y: round3(node.scale.y * scale.y),
        z: round3(node.scale.z * scale.z)
      }
    }
  }
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
  const count = Object.values(nodesOf(document)).filter((node) =>
    node.name.startsWith(label)
  ).length
  return `${label} ${count + 1}`
}

function isAncestor(document: ProjectDocument, ancestorId: string, nodeId: string): boolean {
  const nodes = nodesOf(document)
  const seen = new Set<string>()
  let current = nodes[nodeId]
  while (current?.consumedBy) {
    if (current.consumedBy === ancestorId) return true
    if (seen.has(current.consumedBy)) return false
    seen.add(current.consumedBy)
    current = nodes[current.consumedBy]
  }
  return false
}

export interface ComponentFileResult {
  document: ProjectDocument
  error: string | null
}

export function createComponentFile(
  document: ProjectDocument,
  rawName: string
): ComponentFileResult {
  const error = validateComponentName(document, rawName)
  if (error) return { document, error }
  const name = rawName.trim()
  return {
    document: {
      ...document,
      activeFile: name,
      files: { ...document.files, [name]: emptyModel() }
    },
    error: null
  }
}

export function openModelFile(document: ProjectDocument, fileName: string): ProjectDocument {
  if (!document.files[fileName] || document.activeFile === fileName) return document
  return { ...document, activeFile: fileName }
}

export interface ComponentInstanceResult {
  document: ProjectDocument
  id: string | null
  name: string | null
  error: string | null
}

export function createComponentInstance(
  document: ProjectDocument,
  componentName: string
): ComponentInstanceResult {
  if (componentName === MAIN_FILE || !document.files[componentName]) {
    return { document, id: null, name: null, error: 'Componente não encontrado.' }
  }
  if (introducesCycle(document, document.activeFile, componentName)) {
    return { document, id: null, name: null, error: 'Esse componente criaria um ciclo.' }
  }
  const id = crypto.randomUUID()
  const name = nextName(document, componentName)
  const node: ComponentInstanceNode = {
    ...featureShell(document, id, name),
    kind: 'component',
    componentName,
    scale: { x: 1, y: 1, z: 1 }
  }
  return {
    document: withModel(document, { ...nodesOf(document), [id]: node }),
    id,
    name,
    error: null
  }
}

function asBoolean(node: FeatureNode | undefined): BooleanNode | null {
  if (!node || !isBooleanNode(node)) return null
  return node
}

function asGroup(node: FeatureNode | undefined): GroupNode | null {
  if (!node || !isGroupNode(node)) return null
  return node
}

function createOperationNode(
  document: ProjectDocument,
  kind: OperationKind,
  children: FeatureNode[],
  shared: Omit<OffsetNode, 'kind' | 'childIds' | 'mode' | 'distance' | 'chamfer' | 'extrusion'>
): OperationNode {
  const childIds = children.map((child) => child.id)
  const extrusion = extrusionFrom(children[0])
  if (kind === 'offset') {
    const node: OffsetNode = {
      ...shared,
      kind: 'offset',
      childIds,
      mode: 'radius',
      distance: 1,
      chamfer: false,
      extrusion
    }
    return node
  }
  if (kind === 'hull2d') {
    const node: Hull2dNode = { ...shared, kind: 'hull2d', childIds, extrusion }
    return node
  }
  if (kind === 'hull') {
    const node: HullNode = { ...shared, kind: 'hull', childIds }
    return node
  }
  if (kind === 'mirror') {
    const node: MirrorNode = { ...shared, kind: 'mirror', childIds, axis: 'x' }
    return node
  }
  if (kind === 'revolve') {
    const node: RevolveNode = { ...shared, kind: 'revolve', childIds, angle: 360, start: 0 }
    return node
  }
  if (kind === 'projection') {
    const node: ProjectionNode = { ...shared, kind: 'projection', childIds, cut: false, extrusion }
    return node
  }
  if (kind === 'resize') {
    const node: ResizeNode = {
      ...shared,
      kind: 'resize',
      childIds,
      size: initialResize(document, children[0]),
      auto: false
    }
    return node
  }
  const node: MinkowskiNode = { ...shared, kind: 'minkowski', childIds }
  return node
}

function extrusionFrom(node: FeatureNode | undefined): Extrusion {
  if (node && hasOwnExtrusion(node)) return { ...node.extrusion }
  return defaultExtrusion()
}

function initialResize(document: ProjectDocument, node: FeatureNode | undefined): Vec3 {
  if (!node) return { x: 10, y: 10, z: 10 }
  return boundsSize(localBounds(document, node))
}

function patchOperation(
  next: OperationNode,
  node: OperationNode,
  patch: FeaturePatch
): OperationNode {
  if (isOffsetNode(next) && isOffsetNode(node)) {
    const mode = patch.offsetMode ?? node.mode
    return {
      ...next,
      mode,
      distance: round3(patch.distance ?? node.distance),
      chamfer: mode === 'delta' ? (patch.offsetChamfer ?? node.chamfer) : false,
      extrusion: sanitizeExtrusion(patch.extrusion ?? node.extrusion)
    }
  }
  if (isHull2dNode(next) && isHull2dNode(node)) {
    return { ...next, extrusion: sanitizeExtrusion(patch.extrusion ?? node.extrusion) }
  }
  if (isMirrorNode(next) && isMirrorNode(node)) {
    return { ...next, axis: patch.mirrorAxis ?? node.axis }
  }
  if (isRevolveNode(next) && isRevolveNode(node)) {
    return {
      ...next,
      angle: clampAngle(patch.revolveAngle ?? node.angle),
      start: round3(patch.revolveStart ?? node.start)
    }
  }
  if (isProjectionNode(next) && isProjectionNode(node)) {
    return {
      ...next,
      cut: patch.projectionCut ?? node.cut,
      extrusion: sanitizeExtrusion(patch.extrusion ?? node.extrusion)
    }
  }
  if (isResizeNode(next) && isResizeNode(node)) {
    const size = patch.size ?? node.size
    return {
      ...next,
      auto: patch.resizeAuto ?? node.auto,
      size: {
        x: round3(Math.max(0, size.x)),
        y: round3(Math.max(0, size.y)),
        z: round3(Math.max(0, size.z))
      }
    }
  }
  return next
}

function clampAngle(value: number): number {
  if (!Number.isFinite(value)) return 360
  return round3(Math.min(360, Math.max(0.001, value)))
}
