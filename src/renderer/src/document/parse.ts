import { introducesCycle, MAIN_FILE } from './files'
import {
  type Appearance,
  type BooleanKind,
  type BooleanNode,
  type CircleNode,
  type ComponentInstanceNode,
  type CuboidNode,
  type CylinderNode,
  type EllipseNode,
  type Extrusion,
  type FeatureNode,
  type Hull2dNode,
  type HullNode,
  type MinkowskiNode,
  type MirrorAxis,
  type MirrorNode,
  type ModelFile,
  type NgonNode,
  type OffsetMode,
  type OffsetNode,
  type ProjectDocument,
  type ProjectionNode,
  type RectNode,
  type ResizeNode,
  type RevolveNode,
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
  isComponentNode,
  isGroupNode,
  isRecord,
  isSvgNode
} from './types'

export function parseProjectDocument(value: unknown): ProjectDocument | null {
  if (!isRecord(value)) return null
  if (value.units !== 'mm' || typeof value.name !== 'string') return null
  if (typeof value.fn !== 'number' || !Number.isFinite(value.fn)) return null
  if (value.version === 1) return parseVersionOne(value)
  if (value.version === 2) return parseVersionTwo(value)
  return null
}

function parseVersionOne(value: Record<string, unknown>): ProjectDocument | null {
  const file = parseModelFile(value.nodes, value.assets)
  if (!file) return null
  return finishDocument(value.name as string, value.fn as number, MAIN_FILE, { [MAIN_FILE]: file })
}

function parseVersionTwo(value: Record<string, unknown>): ProjectDocument | null {
  if (!isRecord(value.files)) return null
  const files: Record<string, ModelFile> = {}
  for (const [name, raw] of Object.entries(value.files)) {
    if (!isFileName(name) || !isRecord(raw)) return null
    const file = parseModelFile(raw.nodes, raw.assets)
    if (!file) return null
    files[name] = file
  }
  if (!files[MAIN_FILE]) return null
  const activeFile = typeof value.activeFile === 'string' ? value.activeFile : MAIN_FILE
  return finishDocument(value.name as string, value.fn as number, activeFile, files)
}

function finishDocument(
  name: string,
  fn: number,
  activeFile: string,
  files: Record<string, ModelFile>
): ProjectDocument | null {
  for (const [fileName, file] of Object.entries(files)) {
    for (const node of Object.values(file.nodes)) {
      if (!isComponentNode(node)) continue
      if (!files[node.componentName] || node.componentName === MAIN_FILE) return null
      if (
        introducesCycle(
          { version: 2, name, units: 'mm', fn, activeFile: fileName, files },
          fileName,
          node.componentName
        )
      ) {
        return null
      }
    }
  }
  const resolvedActive = files[activeFile] ? activeFile : MAIN_FILE
  return { version: 2, name, units: 'mm', fn, activeFile: resolvedActive, files }
}

function parseModelFile(nodesValue: unknown, assetsValue: unknown): ModelFile | null {
  if (!isRecord(nodesValue)) return null
  const nodes: Record<string, FeatureNode> = {}
  for (const [id, raw] of Object.entries(nodesValue)) {
    const node = parseNode(id, raw)
    if (!node) return null
    nodes[id] = node
  }
  const assets = parseAssets(assetsValue)
  if (!assets) return null
  for (const node of Object.values(nodes)) {
    if (node.consumedBy !== null && !nodes[node.consumedBy]) return null
    if (isSvgNode(node) && !assets[node.assetId]) return null
    if (!isGroupNode(node)) continue
    for (const childId of node.childIds) {
      const child = nodes[childId]
      if (!child || child.consumedBy !== node.id) return null
    }
  }
  return { nodes, assets }
}

function isFileName(name: string): boolean {
  return name === MAIN_FILE || /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
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
  if (value.kind === 'component') return parseComponent(base, value)
  if (value.kind === 'offset') return parseOffset(base, value)
  if (value.kind === 'hull2d') return parseHull2d(base, value)
  if (value.kind === 'hull') return parseHull(base, value)
  if (value.kind === 'mirror') return parseMirror(base, value)
  if (value.kind === 'revolve') return parseRevolve(base, value)
  if (value.kind === 'projection') return parseProjection(base, value)
  if (value.kind === 'resize') return parseResize(base, value)
  if (value.kind === 'minkowski') return parseMinkowski(base, value)

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

function parseComponent(
  base: FeatureBaseFields,
  value: Record<string, unknown>
): ComponentInstanceNode | null {
  if (
    typeof value.componentName !== 'string' ||
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value.componentName)
  ) {
    return null
  }
  const scale = value.scale === undefined ? { x: 1, y: 1, z: 1 } : parseVec(value.scale)
  if (!scale) return null
  return { ...base, kind: 'component', componentName: value.componentName, scale }
}

function parseOffset(base: FeatureBaseFields, value: Record<string, unknown>): OffsetNode | null {
  const childIds = parseChildIds(value.childIds)
  const extrusion = parseExtrusion(value.extrusion)
  const distance = finite(value.distance)
  const mode = offsetMode(value.mode)
  if (!childIds || !extrusion || distance === null || !mode || typeof value.chamfer !== 'boolean') {
    return null
  }
  return { ...base, kind: 'offset', childIds, mode, distance, chamfer: value.chamfer, extrusion }
}

function parseHull2d(base: FeatureBaseFields, value: Record<string, unknown>): Hull2dNode | null {
  const childIds = parseChildIds(value.childIds)
  const extrusion = parseExtrusion(value.extrusion)
  if (!childIds || !extrusion) return null
  return { ...base, kind: 'hull2d', childIds, extrusion }
}

function parseHull(base: FeatureBaseFields, value: Record<string, unknown>): HullNode | null {
  const childIds = parseChildIds(value.childIds)
  if (!childIds) return null
  return { ...base, kind: 'hull', childIds }
}

function parseMirror(base: FeatureBaseFields, value: Record<string, unknown>): MirrorNode | null {
  const childIds = parseChildIds(value.childIds)
  const axis = mirrorAxis(value.axis)
  if (!childIds || !axis) return null
  return { ...base, kind: 'mirror', childIds, axis }
}

function parseRevolve(base: FeatureBaseFields, value: Record<string, unknown>): RevolveNode | null {
  const childIds = parseChildIds(value.childIds)
  const angle = finite(value.angle)
  const start = finite(value.start)
  if (!childIds || angle === null || start === null) return null
  return { ...base, kind: 'revolve', childIds, angle, start }
}

function parseProjection(
  base: FeatureBaseFields,
  value: Record<string, unknown>
): ProjectionNode | null {
  const childIds = parseChildIds(value.childIds)
  const extrusion = parseExtrusion(value.extrusion)
  if (!childIds || !extrusion || typeof value.cut !== 'boolean') return null
  return { ...base, kind: 'projection', childIds, cut: value.cut, extrusion }
}

function parseResize(base: FeatureBaseFields, value: Record<string, unknown>): ResizeNode | null {
  const childIds = parseChildIds(value.childIds)
  const size = parseVec(value.size)
  if (!childIds || !size || typeof value.auto !== 'boolean') return null
  return { ...base, kind: 'resize', childIds, size, auto: value.auto }
}

function parseMinkowski(
  base: FeatureBaseFields,
  value: Record<string, unknown>
): MinkowskiNode | null {
  const childIds = parseChildIds(value.childIds)
  if (!childIds) return null
  return { ...base, kind: 'minkowski', childIds }
}

function parseChildIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((childId) => typeof childId !== 'string')) return null
  return value
}

function offsetMode(value: unknown): OffsetMode | null {
  if (value === 'radius' || value === 'delta') return value
  return null
}

function mirrorAxis(value: unknown): MirrorAxis | null {
  if (value === 'x' || value === 'y' || value === 'z') return value
  return null
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
  enabled: boolean
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
    appearance,
    enabled: value.enabled !== false
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
