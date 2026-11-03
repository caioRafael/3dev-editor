import type { ProjectDocument } from '../document/types'
import { isProfileNode, isSvgNode, isTextNode } from '../document/types'
import { shapeContours, type ContourSet, emptyContours } from './contours'
import { contoursFromSvg } from './svgContours'
import { contoursFromText } from './textContours'

export async function prepareContours(
  document: ProjectDocument
): Promise<Record<string, ContourSet>> {
  const segments = Math.max(8, Math.min(128, Math.round(document.fn)))
  const contours: Record<string, ContourSet> = {}
  for (const node of Object.values(document.nodes)) {
    if (!node.visible || !isProfileNode(node)) continue
    if (isTextNode(node)) {
      contours[node.id] = await contoursFromText(node, segments)
      continue
    }
    if (isSvgNode(node)) {
      const asset = document.assets[node.assetId]
      contours[node.id] = asset ? contoursFromSvg(asset.source, node, segments) : emptyContours()
      continue
    }
    contours[node.id] = shapeContours(node, segments)
  }
  return contours
}
