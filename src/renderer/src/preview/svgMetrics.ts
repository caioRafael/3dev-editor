import { round3 } from '../document/math'
import type { Vec2 } from '../document/types'
import { readSvgMetrics, type SvgMetrics } from '../../../shared/svg'

export const OPENSCAD_SVG_PIXEL_MM = 25.4 / 96

export type { SvgMetrics }
export { readSvgMetrics }

export function openscadSvgScale(mmPerUnit: number, importScale: number): number {
  return (mmPerUnit * importScale) / OPENSCAD_SVG_PIXEL_MM
}

export function importScaleFromOpenscad(openscadScale: number, mmPerUnit: number): number {
  if (mmPerUnit <= 0) return 1
  return (openscadScale * OPENSCAD_SVG_PIXEL_MM) / mmPerUnit
}

export function svgImportCorrection(viewMin: Vec2, mmPerUnit: number): Vec2 {
  return {
    x: viewMin.x * mmPerUnit,
    y: 3 * viewMin.y * mmPerUnit
  }
}

export function svgCenter(
  viewMin: Vec2,
  viewSize: Vec2,
  mmPerUnit: number,
  importScale: number
): Vec2 {
  const scale = mmPerUnit * importScale
  return {
    x: round3(-(viewMin.x + viewSize.x / 2) * scale),
    y: round3(-(viewMin.y + viewSize.y / 2) * scale)
  }
}

export function roundVec2(value: Vec2): Vec2 {
  return { x: round3(value.x), y: round3(value.y) }
}
