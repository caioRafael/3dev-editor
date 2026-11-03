import type { TextNode } from '../document/types'
import { commandsToRings, type ContourPoint, type ContourSet, emptyContours } from './contours'
import { loadEditorFont, type GlyphPath } from './editorFont'

/** OpenSCAD draws `size` as size/0.72 of the em square. BOSL2 documents this in text(). */
const OPENSCAD_FONT_RATIO = 0.72

export async function contoursFromText(node: TextNode, segments: number): Promise<ContourSet> {
  const text = node.text.trim()
  if (!text) return emptyContours()
  const font = await loadEditorFont()
  const fontSize = node.size / OPENSCAD_FONT_RATIO
  const path = font.getPath(text, 0, 0, fontSize)
  return alignText(path, node, segments)
}

export function alignText(path: GlyphPath, node: TextNode, segments: number): ContourSet {
  const rings = commandsToRings(path.commands, Math.max(4, Math.round(segments / 12)))
  const points = rings.flatMap((ring) => ring.points)
  if (points.length === 0) return emptyContours()
  const bounds = boundsOf(points)
  const shift = alignmentShift(bounds, node)
  return {
    fillRule: 'NonZero',
    rings: rings.map((ring) => ({
      points: ring.points.map((point) => ({ x: point.x + shift.x, y: point.y + shift.y }))
    }))
  }
}

function alignmentShift(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  node: TextNode
): ContourPoint {
  const x =
    node.halign === 'left'
      ? -bounds.minX
      : node.halign === 'right'
        ? -bounds.maxX
        : -(bounds.minX + bounds.maxX) / 2
  const y =
    node.valign === 'top'
      ? -bounds.maxY
      : node.valign === 'bottom'
        ? -bounds.minY
        : node.valign === 'center'
          ? -(bounds.minY + bounds.maxY) / 2
          : 0
  return { x, y }
}

function boundsOf(points: ContourPoint[]): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  return { minX, maxX, minY, maxY }
}
