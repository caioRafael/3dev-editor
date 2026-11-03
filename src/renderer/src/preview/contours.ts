import type {
  CircleNode,
  EllipseNode,
  Extrusion,
  NgonNode,
  RectNode,
  StarNode
} from '../document/types'

export interface ContourPoint {
  x: number
  y: number
}

export interface ContourRing {
  points: ContourPoint[]
}

export type ContourFill = 'NonZero' | 'EvenOdd'

export interface ContourSet {
  rings: ContourRing[]
  fillRule: ContourFill
}

export function emptyContours(): ContourSet {
  return { rings: [], fillRule: 'NonZero' }
}

export function extrusionDivisions(extrusion: Extrusion, segments: number): number {
  const twistSteps = Math.ceil(Math.abs(extrusion.twist) / 15)
  const scaleSteps =
    Math.abs(extrusion.scale - 1) > 0.001 ? Math.max(4, Math.round(segments / 8)) : 0
  return Math.max(twistSteps, scaleSteps)
}

export function shapeContours(
  node: RectNode | CircleNode | EllipseNode | NgonNode | StarNode,
  segments: number
): ContourSet {
  const count = Math.max(8, Math.min(128, Math.round(segments)))
  if (node.kind === 'rect') {
    return ring(rectContour(node.size.x, node.size.y, node.rounding, node.chamfer, count))
  }
  if (node.kind === 'circle') return ring(ellipseContour(node.diameter, node.diameter, count))
  if (node.kind === 'ellipse') {
    return ring(ellipseContour(node.diameter.x, node.diameter.y, count))
  }
  if (node.kind === 'ngon') {
    return ring(ngonContour(node.sides, node.diameter, node.rounding, count))
  }
  return ring(starContour(node.points, node.diameter, node.innerDiameter))
}

export function rectContour(
  width: number,
  depth: number,
  rounding: number,
  chamfer: number,
  segments: number
): ContourPoint[] {
  const halfWidth = width / 2
  const halfDepth = depth / 2
  const corners = [
    { x: halfWidth, y: -halfDepth },
    { x: halfWidth, y: halfDepth },
    { x: -halfWidth, y: halfDepth },
    { x: -halfWidth, y: -halfDepth }
  ]
  if (rounding > 0) return fillet(corners, rounding, segments)
  if (chamfer > 0) return chamferPolygon(corners, chamfer)
  return corners
}

export function ellipseContour(width: number, depth: number, segments: number): ContourPoint[] {
  const radiusX = width / 2
  const radiusY = depth / 2
  const count = Math.max(8, segments)
  const points: ContourPoint[] = []
  for (let index = 0; index < count; index += 1) {
    const angle = (index * 2 * Math.PI) / count
    points.push({ x: radiusX * Math.cos(angle), y: radiusY * Math.sin(angle) })
  }
  return points
}

export function ngonContour(
  sides: number,
  diameter: number,
  rounding: number,
  segments: number
): ContourPoint[] {
  const count = Math.max(3, Math.round(sides))
  const radius = diameter / 2
  const points: ContourPoint[] = []
  for (let index = 0; index < count; index += 1) {
    const angle = (index * 2 * Math.PI) / count
    points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
  }
  if (rounding <= 0) return points
  return fillet(points, rounding, segments)
}

export function starContour(
  points: number,
  diameter: number,
  innerDiameter: number
): ContourPoint[] {
  const count = Math.max(3, Math.round(points))
  const outer = diameter / 2
  const inner = innerDiameter / 2
  const ringPoints: ContourPoint[] = []
  for (let index = 0; index < count * 2; index += 1) {
    const angle = (index * Math.PI) / count
    const radius = index % 2 === 0 ? outer : inner
    ringPoints.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
  }
  return ensureCounterClockwise(ringPoints)
}

export function commandsToRings(
  commands: ReadonlyArray<{
    type: string
    x?: number
    y?: number
    x1?: number
    y1?: number
    x2?: number
    y2?: number
  }>,
  steps: number
): ContourRing[] {
  const rings: ContourPoint[][] = []
  let current: ContourPoint[] = []
  let cursor = { x: 0, y: 0 }
  let start = { x: 0, y: 0 }
  const curveSteps = Math.max(4, steps)
  const pushRing = (): void => {
    if (current.length >= 3) rings.push(current)
    current = []
  }
  for (const command of commands) {
    if (command.type === 'M') {
      if (current.length > 0) pushRing()
      cursor = { x: command.x ?? 0, y: command.y ?? 0 }
      start = cursor
      current.push(cursor)
      continue
    }
    if (command.type === 'L') {
      cursor = { x: command.x ?? cursor.x, y: command.y ?? cursor.y }
      current.push(cursor)
      continue
    }
    if (command.type === 'C') {
      const next = { x: command.x ?? cursor.x, y: command.y ?? cursor.y }
      current.push(
        ...sampleCubic(
          cursor,
          { x: command.x1 ?? cursor.x, y: command.y1 ?? cursor.y },
          { x: command.x2 ?? next.x, y: command.y2 ?? next.y },
          next,
          curveSteps
        )
      )
      cursor = next
      continue
    }
    if (command.type === 'Q') {
      const next = { x: command.x ?? cursor.x, y: command.y ?? cursor.y }
      current.push(
        ...sampleQuadratic(
          cursor,
          { x: command.x1 ?? cursor.x, y: command.y1 ?? cursor.y },
          next,
          curveSteps
        )
      )
      cursor = next
      continue
    }
    if (command.type === 'Z') {
      if (current.length > 0 && (cursor.x !== start.x || cursor.y !== start.y)) current.push(start)
      cursor = start
      pushRing()
    }
  }
  if (current.length > 0) pushRing()
  return rings
    .map((points) => ({ points: dedupe(points) }))
    .filter((ring) => ring.points.length >= 3)
}

function ring(points: ContourPoint[]): ContourSet {
  const cleaned = dedupe(points)
  if (cleaned.length < 3) return emptyContours()
  return { rings: [{ points: ensureCounterClockwise(cleaned) }], fillRule: 'NonZero' }
}

function fillet(points: ContourPoint[], radius: number, segments: number): ContourPoint[] {
  const count = points.length
  const result: ContourPoint[] = []
  const arcSteps = Math.max(2, Math.round(segments / Math.max(4, count)))
  for (let index = 0; index < count; index += 1) {
    const previous = points[(index - 1 + count) % count]
    const current = points[index]
    const next = points[(index + 1) % count]
    const incoming = unit(subtract(current, previous))
    const outgoing = unit(subtract(next, current))
    if (!incoming || !outgoing) {
      result.push(current)
      continue
    }
    const turn = Math.atan2(cross(incoming, outgoing), dot(incoming, outgoing))
    const absTurn = Math.abs(turn)
    if (absTurn < 1e-4) {
      result.push(current)
      continue
    }
    const cut = Math.min(
      radius / Math.tan(absTurn / 2),
      distance(previous, current) / 2,
      distance(current, next) / 2
    )
    if (!Number.isFinite(cut) || cut <= 0) {
      result.push(current)
      continue
    }
    const actualRadius = cut * Math.tan(absTurn / 2)
    const start = add(current, scale(incoming, -cut))
    const end = add(current, scale(outgoing, cut))
    const left = { x: -incoming.y, y: incoming.x }
    const center = add(start, scale(left, turn > 0 ? actualRadius : -actualRadius))
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x)
    let sweep = endAngle - startAngle
    if (turn > 0 && sweep < 0) sweep += Math.PI * 2
    if (turn < 0 && sweep > 0) sweep -= Math.PI * 2
    result.push(start)
    for (let step = 1; step < arcSteps; step += 1) {
      const angle = startAngle + (sweep * step) / arcSteps
      result.push({
        x: center.x + actualRadius * Math.cos(angle),
        y: center.y + actualRadius * Math.sin(angle)
      })
    }
    result.push(end)
  }
  return result
}

function chamferPolygon(points: ContourPoint[], distanceValue: number): ContourPoint[] {
  const count = points.length
  const result: ContourPoint[] = []
  for (let index = 0; index < count; index += 1) {
    const previous = points[(index - 1 + count) % count]
    const current = points[index]
    const next = points[(index + 1) % count]
    const incoming = unit(subtract(current, previous))
    const outgoing = unit(subtract(next, current))
    if (!incoming || !outgoing) {
      result.push(current)
      continue
    }
    const cut = Math.min(
      distanceValue,
      distance(previous, current) / 2,
      distance(current, next) / 2
    )
    result.push(add(current, scale(incoming, -cut)))
    result.push(add(current, scale(outgoing, cut)))
  }
  return result
}

function sampleCubic(
  start: ContourPoint,
  controlA: ContourPoint,
  controlB: ContourPoint,
  end: ContourPoint,
  steps: number
): ContourPoint[] {
  const points: ContourPoint[] = []
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps
    const u = 1 - t
    points.push({
      x:
        u * u * u * start.x +
        3 * u * u * t * controlA.x +
        3 * u * t * t * controlB.x +
        t * t * t * end.x,
      y:
        u * u * u * start.y +
        3 * u * u * t * controlA.y +
        3 * u * t * t * controlB.y +
        t * t * t * end.y
    })
  }
  return points
}

function sampleQuadratic(
  start: ContourPoint,
  control: ContourPoint,
  end: ContourPoint,
  steps: number
): ContourPoint[] {
  const points: ContourPoint[] = []
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps
    const u = 1 - t
    points.push({
      x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
      y: u * u * start.y + 2 * u * t * control.y + t * t * end.y
    })
  }
  return points
}

function ensureCounterClockwise(points: ContourPoint[]): ContourPoint[] {
  return signedArea(points) < 0 ? [...points].reverse() : points
}

function signedArea(points: ContourPoint[]): number {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}

function dedupe(points: ContourPoint[]): ContourPoint[] {
  const result: ContourPoint[] = []
  for (const point of points) {
    const last = result.at(-1)
    if (last && Math.abs(last.x - point.x) < 1e-6 && Math.abs(last.y - point.y) < 1e-6) continue
    result.push(point)
  }
  if (result.length > 1) {
    const first = result[0]
    const last = result.at(-1)
    if (last && Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) result.pop()
  }
  return result
}

function subtract(left: ContourPoint, right: ContourPoint): ContourPoint {
  return { x: left.x - right.x, y: left.y - right.y }
}

function add(left: ContourPoint, right: ContourPoint): ContourPoint {
  return { x: left.x + right.x, y: left.y + right.y }
}

function scale(point: ContourPoint, factor: number): ContourPoint {
  return { x: point.x * factor, y: point.y * factor }
}

function dot(left: ContourPoint, right: ContourPoint): number {
  return left.x * right.x + left.y * right.y
}

function cross(left: ContourPoint, right: ContourPoint): number {
  return left.x * right.y - left.y * right.x
}

function distance(left: ContourPoint, right: ContourPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function unit(point: ContourPoint): ContourPoint | null {
  const length = Math.hypot(point.x, point.y)
  if (length < 1e-8) return null
  return { x: point.x / length, y: point.y / length }
}
