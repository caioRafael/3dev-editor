import type { SvgNode } from '../document/types'
import { type ContourPoint, type ContourRing, type ContourSet, emptyContours } from './contours'
import {
  applyMatrix,
  ellipsePoints,
  flattenPath,
  identityMatrix,
  multiplyMatrix,
  parseTransformList
} from './svgPath'
import { svgCenter } from './svgMetrics'

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline'])

export function contoursFromSvg(source: string, node: SvgNode, segments: number): ContourSet {
  if (typeof DOMParser === 'undefined') return emptyContours()
  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  if (document.querySelector('parsererror')) return emptyContours()
  const svg = document.querySelector('svg')
  if (!svg) return emptyContours()
  const rings: ContourRing[] = []
  let evenOdd = false
  collectShapes(svg, rings, segments, (value) => {
    if (value) evenOdd = true
  })
  const placed = rings
    .map((ring) => ({
      points: ring.points.map((point) => place(point, node)).filter(isFinitePoint)
    }))
    .filter((ring) => ring.points.length >= 3)
  if (placed.length === 0) return emptyContours()
  return { rings: placed, fillRule: evenOdd ? 'EvenOdd' : 'NonZero' }
}

function collectShapes(
  element: Element,
  rings: ContourRing[],
  segments: number,
  markEvenOdd: (value: boolean) => void
): void {
  const name = element.tagName.toLowerCase()
  if (name !== 'svg' && name !== 'g' && !SHAPES.has(name)) {
    for (const child of element.children) collectShapes(child, rings, segments, markEvenOdd)
    return
  }
  if (isHidden(element)) return
  if (SHAPES.has(name)) {
    if (!isFilled(element)) return
    if (fillRule(element) === 'evenodd') markEvenOdd(true)
    rings.push(...shapeRings(element, segments))
  }
  for (const child of element.children) collectShapes(child, rings, segments, markEvenOdd)
}

function shapeRings(element: Element, segments: number): ContourRing[] {
  const matrix = elementMatrix(element)
  const name = element.tagName.toLowerCase()
  if (name === 'path') {
    const data = element.getAttribute('d')
    if (!data) return []
    return flattenPath(data, matrix, Math.max(4, Math.round(segments / 8)))
  }
  const points = shapePoints(element, segments)
  if (points.length < 3) return []
  return [{ points: points.map((point) => applyMatrix(matrix, point)) }]
}

function shapePoints(element: Element, segments: number): ContourPoint[] {
  const name = element.tagName.toLowerCase()
  if (name === 'rect') {
    const x = numberAttr(element, 'x')
    const y = numberAttr(element, 'y')
    const width = numberAttr(element, 'width')
    const height = numberAttr(element, 'height')
    if (width <= 0 || height <= 0) return []
    const radius = Math.min(
      numberAttr(element, 'rx') || numberAttr(element, 'ry'),
      width / 2,
      height / 2
    )
    const corners = [
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
      { x, y }
    ]
    if (radius <= 0) return corners
    return roundedRect(x, y, width, height, radius, segments)
  }
  if (name === 'circle' || name === 'ellipse') {
    const center = { x: numberAttr(element, 'cx'), y: numberAttr(element, 'cy') }
    const radiusX = name === 'circle' ? numberAttr(element, 'r') : numberAttr(element, 'rx')
    const radiusY = name === 'circle' ? radiusX : numberAttr(element, 'ry')
    if (radiusX <= 0 || radiusY <= 0) return []
    return ellipsePoints(center, radiusX, radiusY, segments)
  }
  const raw = element.getAttribute('points')
  if (!raw) return []
  const values = raw
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part))
  const points: ContourPoint[] = []
  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push({ x: values[index], y: values[index + 1] })
  }
  return points
}

function roundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  segments: number
): ContourPoint[] {
  const steps = Math.max(2, Math.round(segments / 8))
  const corners = [
    { cx: x + width - radius, cy: y + radius, start: -Math.PI / 2 },
    { cx: x + width - radius, cy: y + height - radius, start: 0 },
    { cx: x + radius, cy: y + height - radius, start: Math.PI / 2 },
    { cx: x + radius, cy: y + radius, start: Math.PI }
  ]
  const points: ContourPoint[] = []
  for (const corner of corners) {
    for (let step = 0; step <= steps; step += 1) {
      const angle = corner.start + (Math.PI / 2) * (step / steps)
      points.push({
        x: corner.cx + radius * Math.cos(angle),
        y: corner.cy + radius * Math.sin(angle)
      })
    }
  }
  return points
}

function elementMatrix(element: Element): ReturnType<typeof identityMatrix> {
  const chain: ReturnType<typeof identityMatrix>[] = []
  let current: Element | null = element
  while (current) {
    const raw = current.getAttribute('transform')
    if (raw) chain.push(parseTransformList(raw))
    if (current.tagName.toLowerCase() === 'svg') break
    current = current.parentElement
  }
  let result = identityMatrix()
  for (const matrix of chain) result = multiplyMatrix(matrix, result)
  return result
}

function place(point: ContourPoint, node: SvgNode): ContourPoint {
  const scale = node.mmPerUnit * node.importScale
  const viewCenterX = node.viewMin.x + node.viewSize.x / 2
  const viewCenterY = node.viewMin.y + node.viewSize.y / 2
  const canonical = svgCenter(node.viewMin, node.viewSize, node.mmPerUnit, node.importScale)
  return {
    x: (point.x - viewCenterX) * scale + (node.center.x - canonical.x),
    y: (viewCenterY - point.y) * scale + (node.center.y - canonical.y)
  }
}

function isFilled(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    const fill = current.getAttribute('fill') ?? styleValue(current, 'fill')
    if (fill === 'none') return false
    if (fill) return true
    current = current.parentElement
  }
  return true
}

function isHidden(element: Element): boolean {
  const display = element.getAttribute('display') ?? styleValue(element, 'display')
  const visibility = element.getAttribute('visibility') ?? styleValue(element, 'visibility')
  return display === 'none' || visibility === 'hidden'
}

function fillRule(element: Element): string | null {
  let current: Element | null = element
  while (current) {
    const rule = current.getAttribute('fill-rule') ?? styleValue(current, 'fill-rule')
    if (rule) return rule
    current = current.parentElement
  }
  return null
}

function styleValue(element: Element, name: string): string | null {
  const style = element.getAttribute('style')
  if (!style) return null
  const pattern = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i')
  const match = pattern.exec(style)
  return match?.[1]?.trim() ?? null
}

function numberAttr(element: Element, name: string): number {
  const raw = element.getAttribute(name)
  if (!raw) return 0
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : 0
}

function isFinitePoint(point: ContourPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}
