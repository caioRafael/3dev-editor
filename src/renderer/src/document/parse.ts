import {
  type Appearance,
  type BooleanKind,
  type BooleanNode,
  type CuboidNode,
  type CylinderNode,
  type FeatureNode,
  type ProjectDocument,
  type SphereNode,
  type Transform,
  type Vec3,
  DEFAULT_COLOR,
  isBooleanNode,
  isRecord
} from './types'

export function parseProjectDocument(value: unknown): ProjectDocument | null {
  if (!isRecord(value)) return null
  if (value.version !== 1 || value.units !== 'mm' || typeof value.name !== 'string') return null
  if (typeof value.fn !== 'number' || !Number.isFinite(value.fn)) return null
  if (!isRecord(value.nodes)) return null

  const nodes: Record<string, FeatureNode> = {}
  for (const [id, raw] of Object.entries(value.nodes)) {
    const node = parseNode(id, raw)
    if (!node) return null
    nodes[id] = node
  }

  for (const node of Object.values(nodes)) {
    if (node.consumedBy !== null && !nodes[node.consumedBy]) return null
    if (!isBooleanNode(node)) continue
    for (const childId of node.childIds) {
      const child = nodes[childId]
      if (!child || child.consumedBy !== node.id) return null
    }
  }

  return {
    version: 1,
    name: value.name,
    units: 'mm',
    fn: value.fn,
    nodes
  }
}

function parseNode(id: string, value: unknown): FeatureNode | null {
  if (!isRecord(value) || typeof value.kind !== 'string') return null
  const base = parseBase(id, value)
  if (!base) return null

  if (value.kind === 'cuboid') {
    const size = parseVec(value.size)
    const rounding = finite(value.rounding)
    const chamfer = finite(value.chamfer)
    if (!size || rounding === null || chamfer === null) return null
    const node: CuboidNode = { ...base, kind: 'cuboid', size, rounding, chamfer }
    return node
  }

  if (value.kind === 'cylinder') {
    const height = finite(value.height)
    const diameter = finite(value.diameter)
    if (height === null || diameter === null) return null
    const node: CylinderNode = { ...base, kind: 'cylinder', height, diameter }
    return node
  }

  if (value.kind === 'sphere') {
    const diameter = finite(value.diameter)
    if (diameter === null) return null
    const node: SphereNode = { ...base, kind: 'sphere', diameter }
    return node
  }

  if (isBooleanKind(value.kind)) {
    if (
      !Array.isArray(value.childIds) ||
      value.childIds.some((childId) => typeof childId !== 'string')
    ) {
      return null
    }
    const rounding = value.rounding === undefined ? 0 : finite(value.rounding)
    if (rounding === null) return null
    const node: BooleanNode = {
      ...base,
      kind: value.kind,
      childIds: value.childIds,
      rounding: Math.max(0, rounding)
    }
    return node
  }

  return null
}

function parseBase(id: string, value: Record<string, unknown>): Omit<FeatureNode, 'kind'> | null {
  if (typeof value.name !== 'string' || typeof value.visible !== 'boolean') return null
  if (typeof value.locked !== 'boolean') return null
  if (value.consumedBy !== null && typeof value.consumedBy !== 'string') return null
  const transform = parseTransform(value.transform)
  const appearance = parseAppearance(value.appearance)
  if (!transform || !appearance) return null
  return {
    id,
    name: value.name,
    visible: value.visible,
    locked: value.locked,
    consumedBy: value.consumedBy,
    transform,
    appearance
  }
}

function parseTransform(value: unknown): Transform | null {
  if (!isRecord(value)) return null
  const position = parseVec(value.position)
  const rotation = parseVec(value.rotation)
  if (!position || !rotation) return null
  return { position, rotation }
}

function parseAppearance(value: unknown): Appearance | null {
  if (!isRecord(value) || typeof value.color !== 'string') return null
  const opacity = finite(value.opacity)
  if (opacity === null) return null
  const color = /^#[0-9a-fA-F]{6}$/.test(value.color) ? value.color.toLowerCase() : DEFAULT_COLOR
  return { color, opacity: Math.min(1, Math.max(0, opacity)) }
}

function parseVec(value: unknown): Vec3 | null {
  if (!isRecord(value)) return null
  const x = finite(value.x)
  const y = finite(value.y)
  const z = finite(value.z)
  if (x === null || y === null || z === null) return null
  return { x, y, z }
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isBooleanKind(value: string): value is BooleanKind {
  return value === 'union' || value === 'difference' || value === 'intersection'
}
