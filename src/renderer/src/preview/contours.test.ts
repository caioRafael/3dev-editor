import { describe, expect, it } from 'vitest'
import { ellipseContour, rectContour, starContour } from './contours'
import { flattenPath, identityMatrix } from './svgPath'
import { readSvgMetrics } from './svgMetrics'

describe('profile contours', () => {
  it('builds a centered rectangle of the requested area', () => {
    const points = rectContour(20, 12, 0, 0, 32)
    expect(points).toHaveLength(4)
    expect(signedArea(points)).toBeCloseTo(240)
  })

  it('rounds rectangle corners inside the original box', () => {
    const points = rectContour(20, 12, 2, 0, 32)
    expect(points.length).toBeGreaterThan(4)
    for (const point of points) {
      expect(Math.abs(point.x)).toBeLessThanOrEqual(10.001)
      expect(Math.abs(point.y)).toBeLessThanOrEqual(6.001)
    }
  })

  it('keeps a star counterclockwise', () => {
    expect(signedArea(starContour(5, 18, 8))).toBeGreaterThan(0)
  })

  it('samples a circle around the origin', () => {
    const points = ellipseContour(10, 10, 16)
    expect(points).toHaveLength(16)
    for (const point of points) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(5)
    }
  })
})

describe('svg metrics', () => {
  it('reads a viewBox and a millimeter width', () => {
    const metrics = readSvgMetrics('<svg viewBox="0 0 100 40" width="20mm" height="8mm"></svg>')
    expect(metrics).toEqual({
      viewMin: { x: 0, y: 0 },
      viewSize: { x: 100, y: 40 },
      mmPerUnit: 0.2
    })
  })

  it('flattens a closed path', () => {
    const rings = flattenPath('M 0 0 L 10 0 L 10 4 Z', identityMatrix(), 4)
    expect(rings).toHaveLength(1)
    expect(rings[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 }
    ])
  })
})

function signedArea(points: { x: number; y: number }[]): number {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}
