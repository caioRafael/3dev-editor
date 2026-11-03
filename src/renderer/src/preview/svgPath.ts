import { commandsToRings, type ContourPoint, type ContourRing } from './contours'

interface Matrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

interface PathCommand {
  type: string
  x?: number
  y?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
}

export function identityMatrix(): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
}

export function multiplyMatrix(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f
  }
}

export function applyMatrix(matrix: Matrix, point: ContourPoint): ContourPoint {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f
  }
}

export function parseTransformList(value: string): Matrix {
  const pattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi
  let result = identityMatrix()
  for (const match of value.matchAll(pattern)) {
    const name = match[1].toLowerCase()
    const args = match[2]
      .trim()
      .split(/[\s,]+/)
      .filter((part) => part.length > 0)
      .map((part) => Number(part))
      .filter((part) => Number.isFinite(part))
    result = multiplyMatrix(result, transformPart(name, args))
  }
  return result
}

export function flattenPath(data: string, matrix: Matrix, steps: number): ContourRing[] {
  const commands = parsePath(data)
  const rings = commandsToRings(commands, steps)
  return rings.map((ring) => ({
    points: ring.points.map((point) => applyMatrix(matrix, point))
  }))
}

export function ellipsePoints(
  center: ContourPoint,
  radiusX: number,
  radiusY: number,
  segments: number
): ContourPoint[] {
  const count = Math.max(8, segments)
  const points: ContourPoint[] = []
  for (let index = 0; index < count; index += 1) {
    const angle = (index * 2 * Math.PI) / count
    points.push({
      x: center.x + radiusX * Math.cos(angle),
      y: center.y + radiusY * Math.sin(angle)
    })
  }
  return points
}

function transformPart(name: string, args: number[]): Matrix {
  if (name === 'matrix' && args.length >= 6) {
    return { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] }
  }
  if (name === 'translate') {
    return { a: 1, b: 0, c: 0, d: 1, e: args[0] ?? 0, f: args[1] ?? 0 }
  }
  if (name === 'scale') {
    const x = args[0] ?? 1
    return { a: x, b: 0, c: 0, d: args[1] ?? x, e: 0, f: 0 }
  }
  if (name === 'rotate') {
    const degrees = args[0] ?? 0
    const radians = (degrees * Math.PI) / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    const originX = args[1] ?? 0
    const originY = args[2] ?? 0
    const rotation = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
    return multiplyMatrix(
      multiplyMatrix({ a: 1, b: 0, c: 0, d: 1, e: originX, f: originY }, rotation),
      { a: 1, b: 0, c: 0, d: 1, e: -originX, f: -originY }
    )
  }
  if (name === 'skewx') {
    const tangent = Math.tan(((args[0] ?? 0) * Math.PI) / 180)
    return { a: 1, b: 0, c: tangent, d: 1, e: 0, f: 0 }
  }
  if (name === 'skewy') {
    const tangent = Math.tan(((args[0] ?? 0) * Math.PI) / 180)
    return { a: 1, b: tangent, c: 0, d: 1, e: 0, f: 0 }
  }
  return identityMatrix()
}

function parsePath(data: string): PathCommand[] {
  const tokens = tokenizePath(data)
  const commands: PathCommand[] = []
  let index = 0
  let command = ''
  let cursor = { x: 0, y: 0 }
  let start = { x: 0, y: 0 }
  let control = { x: 0, y: 0 }
  const read = (): number => {
    const token = tokens[index]
    index += 1
    return typeof token === 'number' ? token : 0
  }
  const hasNumber = (): boolean => index < tokens.length
  while (index < tokens.length) {
    const token = tokens[index]
    if (token === undefined) break
    if (typeof token === 'string') {
      command = token
      index += 1
    } else if (!command) {
      break
    }
    const relative = command === command.toLowerCase()
    const kind = command.toUpperCase()
    if (kind === 'Z') {
      commands.push({ type: 'Z' })
      cursor = start
      control = cursor
      if (index < tokens.length && typeof tokens[index] !== 'string') command = ''
      continue
    }
    if (!hasNumber()) break
    if (kind === 'M' || kind === 'L' || kind === 'T') {
      const x = read() + (relative ? cursor.x : 0)
      const y = read() + (relative ? cursor.y : 0)
      if (kind === 'M') {
        commands.push({ type: 'M', x, y })
        start = { x, y }
        command = relative ? 'l' : 'L'
      } else if (kind === 'T') {
        const reflected = {
          x: cursor.x * 2 - control.x,
          y: cursor.y * 2 - control.y
        }
        commands.push({ type: 'Q', x1: reflected.x, y1: reflected.y, x, y })
        control = reflected
      } else {
        commands.push({ type: 'L', x, y })
        control = { x, y }
      }
      cursor = { x, y }
      continue
    }
    if (kind === 'H' || kind === 'V') {
      const value = read()
      const x = kind === 'H' ? value + (relative ? cursor.x : 0) : cursor.x
      const y = kind === 'V' ? value + (relative ? cursor.y : 0) : cursor.y
      commands.push({ type: 'L', x, y })
      cursor = { x, y }
      control = cursor
      continue
    }
    if (kind === 'C') {
      const x1 = read() + (relative ? cursor.x : 0)
      const y1 = read() + (relative ? cursor.y : 0)
      const x2 = read() + (relative ? cursor.x : 0)
      const y2 = read() + (relative ? cursor.y : 0)
      const x = read() + (relative ? cursor.x : 0)
      const y = read() + (relative ? cursor.y : 0)
      commands.push({ type: 'C', x1, y1, x2, y2, x, y })
      control = { x: x2, y: y2 }
      cursor = { x, y }
      continue
    }
    if (kind === 'S') {
      const x2 = read() + (relative ? cursor.x : 0)
      const y2 = read() + (relative ? cursor.y : 0)
      const x = read() + (relative ? cursor.x : 0)
      const y = read() + (relative ? cursor.y : 0)
      const reflected = { x: cursor.x * 2 - control.x, y: cursor.y * 2 - control.y }
      commands.push({ type: 'C', x1: reflected.x, y1: reflected.y, x2, y2, x, y })
      control = { x: x2, y: y2 }
      cursor = { x, y }
      continue
    }
    if (kind === 'Q') {
      const x1 = read() + (relative ? cursor.x : 0)
      const y1 = read() + (relative ? cursor.y : 0)
      const x = read() + (relative ? cursor.x : 0)
      const y = read() + (relative ? cursor.y : 0)
      commands.push({ type: 'Q', x1, y1, x, y })
      control = { x: x1, y: y1 }
      cursor = { x, y }
      continue
    }
    if (kind === 'A') {
      const rx = Math.abs(read())
      const ry = Math.abs(read())
      const rotation = read()
      const large = read()
      const sweep = read()
      const x = read() + (relative ? cursor.x : 0)
      const y = read() + (relative ? cursor.y : 0)
      commands.push(...arcCommands(cursor, { x, y }, rx, ry, rotation, large !== 0, sweep !== 0))
      cursor = { x, y }
      control = cursor
      continue
    }
    break
  }
  return commands
}

function tokenizePath(data: string): Array<number | string> {
  const tokens: Array<number | string> = []
  const pattern = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g
  for (const match of data.matchAll(pattern)) {
    if (match[1]) tokens.push(match[1])
    else if (match[2]) tokens.push(Number(match[2]))
  }
  return tokens
}

function arcCommands(
  start: ContourPoint,
  end: ContourPoint,
  radiusX: number,
  radiusY: number,
  rotation: number,
  large: boolean,
  sweep: boolean
): PathCommand[] {
  if (radiusX === 0 || radiusY === 0) return [{ type: 'L', x: end.x, y: end.y }]
  if (Math.abs(start.x - end.x) < 1e-8 && Math.abs(start.y - end.y) < 1e-8) return []
  const radians = (rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = (start.x - end.x) / 2
  const dy = (start.y - end.y) / 2
  const x1 = cos * dx + sin * dy
  const y1 = -sin * dx + cos * dy
  let rx = radiusX
  let ry = radiusY
  const scale = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (scale > 1) {
    const root = Math.sqrt(scale)
    rx *= root
    ry *= root
  }
  const sign = large === sweep ? -1 : 1
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1
  const root = denominator === 0 ? 0 : Math.sqrt(Math.max(0, numerator / denominator))
  const cx1 = (sign * root * rx * y1) / ry
  const cy1 = (sign * root * -ry * x1) / rx
  const center = {
    x: cos * cx1 - sin * cy1 + (start.x + end.x) / 2,
    y: sin * cx1 + cos * cy1 + (start.y + end.y) / 2
  }
  const startAngle = vectorAngle({ x: (x1 - cx1) / rx, y: (y1 - cy1) / ry })
  const endVector = { x: (-x1 - cx1) / rx, y: (-y1 - cy1) / ry }
  let delta = vectorAngle(endVector) - startAngle
  if (!sweep && delta > 0) delta -= Math.PI * 2
  if (sweep && delta < 0) delta += Math.PI * 2
  const steps = Math.max(4, Math.ceil(Math.abs(delta) / (Math.PI / 8)))
  const commands: PathCommand[] = []
  for (let step = 1; step <= steps; step += 1) {
    const angle = startAngle + (delta * step) / steps
    const local = { x: rx * Math.cos(angle), y: ry * Math.sin(angle) }
    commands.push({
      type: 'L',
      x: cos * local.x - sin * local.y + center.x,
      y: sin * local.x + cos * local.y + center.y
    })
  }
  return commands
}

function vectorAngle(point: ContourPoint): number {
  return Math.atan2(point.y, point.x)
}
