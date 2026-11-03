import { Euler, Quaternion, Vector3 } from 'three'
import {
  type FeatureNode,
  type ProjectDocument,
  type Transform,
  type Vec3,
  isBooleanNode,
  isCuboidNode,
  isCylinderNode,
  isSphereNode
} from './types'

export function round3(value: number): number {
  if (!Number.isFinite(value)) return 0
  const rounded = Math.round(value * 1000) / 1000
  return Object.is(rounded, -0) ? 0 : rounded
}

export function roundVec(value: Vec3): Vec3 {
  return { x: round3(value.x), y: round3(value.y), z: round3(value.z) }
}

export function maxEdgeRadius(size: Vec3): number {
  const span = Math.min(size.x, size.y, size.z)
  if (!Number.isFinite(span)) return 0
  return round3(Math.max(0, span / 2 - 0.001))
}

export interface Bounds {
  min: Vec3
  max: Vec3
}

export function localBounds(document: ProjectDocument, node: FeatureNode): Bounds | null {
  if (isCuboidNode(node)) return centeredBox(node.size.x, node.size.y, node.size.z)
  if (isCylinderNode(node)) return centeredBox(node.diameter, node.diameter, node.height)
  if (isSphereNode(node)) return centeredBox(node.diameter, node.diameter, node.diameter)
  if (!isBooleanNode(node)) return null
  const placed = node.childIds
    .map((id) => document.nodes[id])
    .filter((child): child is FeatureNode => child !== undefined && child.visible)
    .map((child) => placedBounds(document, child))
    .filter((bounds): bounds is Bounds => bounds !== null)
  if (placed.length === 0) return null
  if (node.kind === 'difference') return placed[0]
  if (node.kind === 'intersection') return intersectBounds(placed)
  return unionBounds(placed)
}

export function booleanRadiusLimit(bounds: Bounds | null): number {
  if (!bounds) return 0
  return maxEdgeRadius({
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z
  })
}

export function roundingCubeSize(bounds: Bounds, radius: number): number {
  const extent = Math.max(
    Math.abs(bounds.min.x),
    Math.abs(bounds.max.x),
    Math.abs(bounds.min.y),
    Math.abs(bounds.max.y),
    Math.abs(bounds.min.z),
    Math.abs(bounds.max.z)
  )
  return Math.max(1, Math.ceil(2 * (extent + Math.max(0, radius)) * 1.05))
}

export function addVec(left: Vec3, right: Vec3): Vec3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }
}

export function scaleVec(value: Vec3, factor: Vec3): Vec3 {
  return {
    x: value.x * Math.abs(factor.x),
    y: value.y * Math.abs(factor.y),
    z: value.z * Math.abs(factor.z)
  }
}

export function isNearlyOne(value: Vec3): boolean {
  return [value.x, value.y, value.z].every((component) => Math.abs(Math.abs(component) - 1) < 0.001)
}

export function composeTransform(parent: Transform, child: Transform): Transform {
  const parentQuaternion = new Quaternion().setFromEuler(
    new Euler(
      degreesToRadians(parent.rotation.x),
      degreesToRadians(parent.rotation.y),
      degreesToRadians(parent.rotation.z),
      'XYZ'
    )
  )
  const childQuaternion = new Quaternion().setFromEuler(
    new Euler(
      degreesToRadians(child.rotation.x),
      degreesToRadians(child.rotation.y),
      degreesToRadians(child.rotation.z),
      'XYZ'
    )
  )
  const worldQuaternion = parentQuaternion.clone().multiply(childQuaternion)
  const offset = new Vector3(child.position.x, child.position.y, child.position.z).applyQuaternion(
    parentQuaternion
  )
  const worldEuler = new Euler().setFromQuaternion(worldQuaternion, 'XYZ')
  return {
    position: roundVec({
      x: parent.position.x + offset.x,
      y: parent.position.y + offset.y,
      z: parent.position.z + offset.z
    }),
    rotation: roundVec({
      x: radiansToDegrees(worldEuler.x),
      y: radiansToDegrees(worldEuler.y),
      z: radiansToDegrees(worldEuler.z)
    })
  }
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI
}

function centeredBox(width: number, depth: number, height: number): Bounds {
  return {
    min: { x: -width / 2, y: -depth / 2, z: -height / 2 },
    max: { x: width / 2, y: depth / 2, z: height / 2 }
  }
}

function placedBounds(document: ProjectDocument, node: FeatureNode): Bounds | null {
  const bounds = localBounds(document, node)
  if (!bounds) return null
  return transformBounds(bounds, node.transform)
}

function unionBounds(bounds: Bounds[]): Bounds {
  return {
    min: {
      x: Math.min(...bounds.map((item) => item.min.x)),
      y: Math.min(...bounds.map((item) => item.min.y)),
      z: Math.min(...bounds.map((item) => item.min.z))
    },
    max: {
      x: Math.max(...bounds.map((item) => item.max.x)),
      y: Math.max(...bounds.map((item) => item.max.y)),
      z: Math.max(...bounds.map((item) => item.max.z))
    }
  }
}

function intersectBounds(bounds: Bounds[]): Bounds | null {
  const min = {
    x: Math.max(...bounds.map((item) => item.min.x)),
    y: Math.max(...bounds.map((item) => item.min.y)),
    z: Math.max(...bounds.map((item) => item.min.z))
  }
  const max = {
    x: Math.min(...bounds.map((item) => item.max.x)),
    y: Math.min(...bounds.map((item) => item.max.y)),
    z: Math.min(...bounds.map((item) => item.max.z))
  }
  if (min.x >= max.x || min.y >= max.y || min.z >= max.z) return null
  return { min, max }
}

function transformBounds(bounds: Bounds, transform: Transform): Bounds {
  const quaternion = new Quaternion().setFromEuler(
    new Euler(
      degreesToRadians(transform.rotation.x),
      degreesToRadians(transform.rotation.y),
      degreesToRadians(transform.rotation.z),
      'XYZ'
    )
  )
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new Vector3(x, y, z).applyQuaternion(quaternion)
        const px = point.x + transform.position.x
        const py = point.y + transform.position.y
        const pz = point.z + transform.position.z
        minX = Math.min(minX, px)
        minY = Math.min(minY, py)
        minZ = Math.min(minZ, pz)
        maxX = Math.max(maxX, px)
        maxY = Math.max(maxY, py)
        maxZ = Math.max(maxZ, pz)
      }
    }
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } }
}
