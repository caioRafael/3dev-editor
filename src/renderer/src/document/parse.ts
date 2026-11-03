import {
  type Appearance,
  type BooleanKind,
  type BooleanNode,
  type CircleNode,
  type CuboidNode,
  type CylinderNode,
  type EllipseNode,
  type Extrusion,
  type FeatureNode,
  type NgonNode,
  type ProjectDocument,
  type RectNode,
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
  DEFAULT_COLOR,
  DEFAULT_FONT,
  isBooleanNode,
  isRecord,
  isSvgNode
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

  const assets = parseAssets(value.assets)
  if (!assets) return null

  for (const node of Object.values(nodes)) {
    if (node.consumedBy !== null && !nodes[node.consumedBy]) return null
    if (isSvgNode(node) && !assets[node.assetId]) return null
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
    nodes,
    assets
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

  if (value.kind === 'rect') return parseRect(base, value)
  if (value.kind === 'circle') return parseCircle(base, value)
  if (value.kind === 'ellipse') return parseEllipse(base, value)
  if (value.kind === 'ngon') return parseNgon(base, value)
  if (value.kind === 'star') return parseStar(base, value)
  if (value.kind === 'text') return parseText(base, value)
  if (value.kind === 'svg') return parseSvg(base, value)

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

function parseRect(base: FeatureBaseFields, value: Record<string, unknown>): RectNode | null {
  const size = parseVec2(value.size)
  const rounding = finite(value.rounding)
  const chamfer = finite(value.chamfer)
  const extrusion = parseExtrusion(value.extrusion)
  if (!size || rounding === null || chamfer === null || !extrusion) return null
  if (size.x <= 0 || size.y <= 0) return null
  return { ...base, kind: 'rect', size, rounding, chamfer, extrusion }
}

function parseCircle(base: FeatureBaseFields, value: Record<string, unknown>): CircleNode | null {
  const diameter = finite(value.diameter)
  const extrusion = parseExtrusion(value.extrusion)
  if (diameter === null || diameter <= 0 || !extrusion) return null
  return { ...base, kind: 'circle', diameter, extrusion }
}

function parseEllipse(base: FeatureBaseFields, value: Record<string, unknown>): EllipseNode | null {
  const diameter = parseVec2(value.diameter)
  const extrusion = parseExtrusion(value.extrusion)
  if (!diameter || diameter.x <= 0 || diameter.y <= 0 || !extrusion) return null
  return { ...base, kind: 'ellipse', diameter, extrusion }
}

function parseNgon(base: FeatureBaseFields, value: Record<string, unknown>): NgonNode | null {
  const sides = finite(value.sides)
  const diameter = finite(value.diameter)
  const rounding = finite(value.rounding)
  const extrusion = parseExtrusion(value.extrusion)
  if (sides === null || diameter === null || rounding === null || !extrusion) return null
  if (sides < 3 || diameter <= 0) return null
  return { ...base, kind: 'ngon', sides: Math.round(sides), diameter, rounding, extrusion }
}

function parseStar(base: FeatureBaseFields, value: Record<string, unknown>): StarNode | null {
  const points = finite(value.points)
  const diameter = finite(value.diameter)
  const innerDiameter = finite(value.innerDiameter)
  const extrusion = parseExtrusion(value.extrusion)
  if (points === null || diameter === null || innerDiameter === null || !extrusion) return null
  if (points < 3 || diameter <= 0 || innerDiameter <= 0) return null
  return {
    ...base,
    kind: 'star',
    points: Math.round(points),
    diameter,
    innerDiameter,
    extrusion
  }
}

function parseText(base: FeatureBaseFields, value: Record<string, unknown>): TextNode | null {
  const size = finite(value.size)
  const extrusion = parseExtrusion(value.extrusion)
  const halign = textHalign(value.halign)
  const valign = textValign(value.valign)
  if (typeof value.text !== 'string' || typeof value.font !== 'string') return null
  if (size === null || size <= 0 || !extrusion || !halign || !valign) return null
  return {
    ...base,
    kind: 'text',
    text: value.text,
    size,
    font: value.font || DEFAULT_FONT,
    halign,
    valign,
    extrusion
  }
}

function parseSvg(base: FeatureBaseFields, value: Record<string, unknown>): SvgNode | null {
  const center = parseVec2(value.center)
  const viewMin = parseVec2(value.viewMin)
  const viewSize = parseVec2(value.viewSize)
  const importScale = finite(value.importScale)
  const mmPerUnit = finite(value.mmPerUnit)
  const extrusion = parseExtrusion(value.extrusion)
  if (typeof value.assetId !== 'string' || !center || !viewMin || !viewSize) return null
  if (importScale === null || mmPerUnit === null || mmPerUnit <= 0 || !extrusion) return null
  if (viewSize.x <= 0 || viewSize.y <= 0) return null
  return {
    ...base,
    kind: 'svg',
    assetId: value.assetId,
    center,
    importScale,
    mmPerUnit,
    viewMin,
    viewSize,
    extrusion
  }
}

function parseExtrusion(value: unknown): Extrusion | null {
  if (!isRecord(value)) return null
  const height = finite(value.height)
  const twist = finite(value.twist)
  const scale = finite(value.scale)
  if (height === null || twist === null || scale === null) return null
  if (height <= 0 || scale < 0) return null
  return { height, twist, scale }
}

function parseAssets(value: unknown): Record<string, SvgAsset> | null {
  if (value === undefined) return {}
  if (!isRecord(value)) return null
  const assets: Record<string, SvgAsset> = {}
  for (const [id, raw] of Object.entries(value)) {
    if (!isRecord(raw) || raw.kind !== 'svg') return null
    if (typeof raw.name !== 'string' || typeof raw.source !== 'string' || raw.id !== id) return null
    assets[id] = { id, name: raw.name, kind: 'svg', source: raw.source }
  }
  return assets
}

interface FeatureBaseFields {
  id: string
  name: string
  visible: boolean
  locked: boolean
  consumedBy: string | null
  transform: Transform
  appearance: Appearance
}

function parseBase(id: string, value: Record<string, unknown>): FeatureBaseFields | null {
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

function parseVec2(value: unknown): Vec2 | null {
  if (!isRecord(value)) return null
  const x = finite(value.x)
  const y = finite(value.y)
  if (x === null || y === null) return null
  return { x, y }
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

function textHalign(value: unknown): TextHalign | null {
  if (value === 'left' || value === 'center' || value === 'right') return value
  return null
}

function textValign(value: unknown): TextValign | null {
  if (value === 'top' || value === 'center' || value === 'baseline' || value === 'bottom')
    return value
  return null
}
