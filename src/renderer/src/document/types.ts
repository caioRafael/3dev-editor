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

export type ProfileNode =
  RectNode | CircleNode | EllipseNode | NgonNode | StarNode | TextNode | SvgNode
export type FeatureNode =
  CuboidNode | CylinderNode | SphereNode | BooleanNode | ProfileNode | ComponentInstanceNode
export type BooleanKind = BooleanNode['kind']
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
