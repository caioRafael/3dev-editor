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
import {
  type BooleanKind,
  type BooleanNode,
  type CuboidNode,
  type CylinderNode,
  type FeatureNode,
  type FeaturePatch,
  type PrimitiveKind,
  type ProjectDocument,
  type SphereNode,
  type Transform,
  type Vec3,
  MIN_SIZE,
  identityTransform,
  isBooleanNode,
  isCuboidNode,
  isCylinderNode,
  isSphereNode
} from './types'

const PALETTE = ['#d97757', '#5b8def', '#6fbf73', '#e0b44f', '#b07cc6', '#4fb6c4']

const LABELS: Record<PrimitiveKind | BooleanKind, string> = {
  cuboid: 'Cubo',
  cylinder: 'Cilindro',
  sphere: 'Esfera',
  union: 'União',
  difference: 'Diferença',
  intersection: 'Interseção'
}

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
  return { version: 1, name, units: 'mm', fn: 48, nodes: {} }
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
  return { ...document, nodes: repairBooleans(nodes) }
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
