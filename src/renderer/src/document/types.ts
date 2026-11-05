export const DEFAULT_COLOR = '#c4ccd4'
export const MIN_SIZE = 0.1

export interface Vec2 {
  x: number
  y: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Transform {
  position: Vec3
  rotation: Vec3
}

export interface Appearance {
  color: string
  opacity: number
}

export interface FeatureBase {
  id: string
  name: string
  visible: boolean
  locked: boolean
  consumedBy: string | null
  transform: Transform
  appearance: Appearance
  /** Absent or true applies a group. False keeps the children and skips the effect. */
  enabled?: boolean
}

export interface CuboidNode extends FeatureBase {
  kind: 'cuboid'
  size: Vec3
  rounding: number
  chamfer: number
}

export interface CylinderNode extends FeatureBase {
  kind: 'cylinder'
  height: number
  diameter: number
}

export interface SphereNode extends FeatureBase {
  kind: 'sphere'
  diameter: number
}

export interface BooleanNode extends FeatureBase {
  kind: 'union' | 'difference' | 'intersection'
  childIds: string[]
  rounding: number
}

export interface Extrusion {
  height: number
  twist: number
  scale: number
}

export interface ProfileBase extends FeatureBase {
  extrusion: Extrusion
}

export interface RectNode extends ProfileBase {
  kind: 'rect'
  size: Vec2
  rounding: number
  chamfer: number
}

export interface CircleNode extends ProfileBase {
  kind: 'circle'
  diameter: number
}

export interface EllipseNode extends ProfileBase {
  kind: 'ellipse'
  diameter: Vec2
}

export interface NgonNode extends ProfileBase {
  kind: 'ngon'
  sides: number
  diameter: number
  rounding: number
}

export interface StarNode extends ProfileBase {
  kind: 'star'
  points: number
  diameter: number
  innerDiameter: number
}

export type TextHalign = 'left' | 'center' | 'right'
export type TextValign = 'top' | 'center' | 'baseline' | 'bottom'

export interface TextNode extends ProfileBase {
  kind: 'text'
  text: string
  size: number
  font: string
  halign: TextHalign
  valign: TextValign
}

export interface SvgNode extends ProfileBase {
  kind: 'svg'
  assetId: string
  /** Translation applied inside the extrusion, in millimeters. */
  center: Vec2
  /** Multiplier on top of the SVG unit conversion. */
  importScale: number
  /** SVG user unit converted to millimeters, before importScale. */
  mmPerUnit: number
  viewMin: Vec2
  viewSize: Vec2
}

export interface SvgAsset {
  id: string
  name: string
  kind: 'svg'
  source: string
}

export interface ComponentInstanceNode extends FeatureBase {
  kind: 'component'
  componentName: string
  scale: Vec3
}

export type OffsetMode = 'radius' | 'delta'
export type MirrorAxis = 'x' | 'y' | 'z'

export interface OffsetNode extends FeatureBase {
  kind: 'offset'
  childIds: string[]
  mode: OffsetMode
  distance: number
  chamfer: boolean
  extrusion: Extrusion
}

export interface Hull2dNode extends FeatureBase {
  kind: 'hull2d'
  childIds: string[]
  extrusion: Extrusion
}

export interface HullNode extends FeatureBase {
  kind: 'hull'
  childIds: string[]
}

export interface MirrorNode extends FeatureBase {
  kind: 'mirror'
  childIds: string[]
  axis: MirrorAxis
}

export interface RevolveNode extends FeatureBase {
  kind: 'revolve'
  childIds: string[]
  angle: number
  start: number
}

export interface ProjectionNode extends FeatureBase {
  kind: 'projection'
  childIds: string[]
  cut: boolean
  extrusion: Extrusion
}

export interface ResizeNode extends FeatureBase {
  kind: 'resize'
  childIds: string[]
  size: Vec3
  auto: boolean
}

export interface MinkowskiNode extends FeatureBase {
  kind: 'minkowski'
  childIds: string[]
}

export type OperationNode =
  | OffsetNode
  | Hull2dNode
  | HullNode
  | MirrorNode
  | RevolveNode
  | ProjectionNode
  | ResizeNode
  | MinkowskiNode

export type GroupNode = BooleanNode | OperationNode

export type ProfileNode =
  RectNode | CircleNode | EllipseNode | NgonNode | StarNode | TextNode | SvgNode
export type FeatureNode =
  | CuboidNode
  | CylinderNode
  | SphereNode
  | BooleanNode
  | ProfileNode
  | ComponentInstanceNode
  | OperationNode
export type BooleanKind = BooleanNode['kind']
export type OperationKind = OperationNode['kind']
export type PrimitiveKind = 'cuboid' | 'cylinder' | 'sphere'
export type ProfileKind = ProfileNode['kind']
export type ShapeProfileKind = Exclude<ProfileKind, 'svg'>
export type EditorTool = 'select' | 'move' | 'rotate' | 'scale'
export type PreviewMode = 'fast' | 'openscad'

export const DEFAULT_FONT = 'Liberation Sans'

export interface ModelFile {
  nodes: Record<string, FeatureNode>
  assets: Record<string, SvgAsset>
}

export interface ProjectDocument {
  version: 2
  name: string
  units: 'mm'
  fn: number
  activeFile: string
  files: Record<string, ModelFile>
}

export interface FeaturePatch {
  name?: string
  visible?: boolean
  locked?: boolean
  enabled?: boolean
  transform?: Transform
  appearance?: Appearance
  size?: Vec3
  rounding?: number
  chamfer?: number
  height?: number
  diameter?: number
  extrusion?: Extrusion
  size2?: Vec2
  diameter2?: Vec2
  sides?: number
  points?: number
  innerDiameter?: number
  text?: string
  textSize?: number
  font?: string
  halign?: TextHalign
  valign?: TextValign
  importScale?: number
  scale?: Vec3
  offsetMode?: OffsetMode
  distance?: number
  offsetChamfer?: boolean
  mirrorAxis?: MirrorAxis
  revolveAngle?: number
  revolveStart?: number
  projectionCut?: boolean
  resizeAuto?: boolean
}

export function zeroVec(): Vec3 {
  return { x: 0, y: 0, z: 0 }
}

export function identityTransform(): Transform {
  return { position: zeroVec(), rotation: zeroVec() }
}

export function isBooleanNode(node: FeatureNode): node is BooleanNode {
  return node.kind === 'union' || node.kind === 'difference' || node.kind === 'intersection'
}

export function isOffsetNode(node: FeatureNode): node is OffsetNode {
  return node.kind === 'offset'
}

export function isHull2dNode(node: FeatureNode): node is Hull2dNode {
  return node.kind === 'hull2d'
}

export function isHullNode(node: FeatureNode): node is HullNode {
  return node.kind === 'hull'
}

export function isMirrorNode(node: FeatureNode): node is MirrorNode {
  return node.kind === 'mirror'
}

export function isRevolveNode(node: FeatureNode): node is RevolveNode {
  return node.kind === 'revolve'
}

export function isProjectionNode(node: FeatureNode): node is ProjectionNode {
  return node.kind === 'projection'
}

export function isResizeNode(node: FeatureNode): node is ResizeNode {
  return node.kind === 'resize'
}

export function isMinkowskiNode(node: FeatureNode): node is MinkowskiNode {
  return node.kind === 'minkowski'
}

export function isOperationNode(node: FeatureNode): node is OperationNode {
  return (
    isOffsetNode(node) ||
    isHull2dNode(node) ||
    isHullNode(node) ||
    isMirrorNode(node) ||
    isRevolveNode(node) ||
    isProjectionNode(node) ||
    isResizeNode(node) ||
    isMinkowskiNode(node)
  )
}

export function isGroupNode(node: FeatureNode): node is GroupNode {
  return isBooleanNode(node) || isOperationNode(node)
}

export function isGroupEnabled(node: FeatureNode): boolean {
  return !isGroupNode(node) || node.enabled !== false
}

export function showsInactiveChildren(
  nodes: Record<string, FeatureNode>,
  node: FeatureNode
): boolean {
  const parent = node.consumedBy ? nodes[node.consumedBy] : undefined
  if (!parent || !isGroupNode(parent) || isGroupEnabled(parent)) return false
  let cursor: FeatureNode = parent
  while (cursor.consumedBy) {
    const ancestor = nodes[cursor.consumedBy]
    if (!ancestor || !isGroupNode(ancestor)) return true
    if (isGroupEnabled(ancestor)) return false
    cursor = ancestor
  }
  return true
}

export function hasFlatForm(node: FeatureNode): boolean {
  return isProfileNode(node) || isOffsetNode(node) || isHull2dNode(node) || isProjectionNode(node)
}

export function hasOwnExtrusion(
  node: FeatureNode
): node is ProfileNode | OffsetNode | Hull2dNode | ProjectionNode {
  return isProfileNode(node) || isOffsetNode(node) || isHull2dNode(node) || isProjectionNode(node)
}

export function operationMinimum(kind: OperationKind): number {
  if (kind === 'hull2d' || kind === 'hull' || kind === 'minkowski') return 2
  return 1
}

export function operationNeedsFlat(kind: OperationKind): boolean {
  return kind === 'offset' || kind === 'hull2d' || kind === 'revolve'
}

export function isComponentNode(node: FeatureNode): node is ComponentInstanceNode {
  return node.kind === 'component'
}

export function isCuboidNode(node: FeatureNode): node is CuboidNode {
  return node.kind === 'cuboid'
}

export function isCylinderNode(node: FeatureNode): node is CylinderNode {
  return node.kind === 'cylinder'
}

export function isSphereNode(node: FeatureNode): node is SphereNode {
  return node.kind === 'sphere'
}

export function isRectNode(node: FeatureNode): node is RectNode {
  return node.kind === 'rect'
}

export function isCircleNode(node: FeatureNode): node is CircleNode {
  return node.kind === 'circle'
}

export function isEllipseNode(node: FeatureNode): node is EllipseNode {
  return node.kind === 'ellipse'
}

export function isNgonNode(node: FeatureNode): node is NgonNode {
  return node.kind === 'ngon'
}

export function isStarNode(node: FeatureNode): node is StarNode {
  return node.kind === 'star'
}

export function isTextNode(node: FeatureNode): node is TextNode {
  return node.kind === 'text'
}

export function isSvgNode(node: FeatureNode): node is SvgNode {
  return node.kind === 'svg'
}

export function isProfileNode(node: FeatureNode): node is ProfileNode {
  return (
    isRectNode(node) ||
    isCircleNode(node) ||
    isEllipseNode(node) ||
    isNgonNode(node) ||
    isStarNode(node) ||
    isTextNode(node) ||
    isSvgNode(node)
  )
}

export function defaultExtrusion(height = 4): Extrusion {
  return { height, twist: 0, scale: 1 }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
