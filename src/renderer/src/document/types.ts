export const DEFAULT_COLOR = '#c4ccd4'
export const MIN_SIZE = 0.1

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

export type FeatureNode = CuboidNode | CylinderNode | SphereNode | BooleanNode
export type BooleanKind = BooleanNode['kind']
export type PrimitiveKind = 'cuboid' | 'cylinder' | 'sphere'
export type EditorTool = 'select' | 'move' | 'rotate' | 'scale'
export type PreviewMode = 'fast' | 'openscad'

export interface ProjectDocument {
  version: 1
  name: string
  units: 'mm'
  fn: number
  nodes: Record<string, FeatureNode>
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

export function isCuboidNode(node: FeatureNode): node is CuboidNode {
  return node.kind === 'cuboid'
}

export function isCylinderNode(node: FeatureNode): node is CylinderNode {
  return node.kind === 'cylinder'
}

export function isSphereNode(node: FeatureNode): node is SphereNode {
  return node.kind === 'sphere'
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
