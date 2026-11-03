import { useEffect, useState } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import { useEditor } from '../document/store'
import { type FeatureNode, isProfileNode, isSvgNode } from '../document/types'
import { buildProfileMesh } from './manifoldPreview'
import { prepareContours } from './prepareContours'

export function useProfileGeometry(node: FeatureNode, segments: number): BufferGeometry | null {
  const assetKey = useEditor((state) =>
    isSvgNode(node) ? checksum(state.document.assets[node.assetId]?.source ?? '') : ''
  )
  const key = isProfileNode(node) ? `${profileKey(node)}:${segments}:${assetKey}` : ''
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null)

  useEffect(() => {
    if (!key || !isProfileNode(node)) return undefined
    let cancelled = false
    const document = useEditor.getState().document
    void prepareContours(document)
      .then((contours) => {
        const contour = contours[node.id]
        if (!contour) return null
        return buildProfileMesh(contour, node.extrusion, segments)
      })
      .then((data) => {
        if (cancelled || !data || data.positions.length === 0) return
        setGeometry((current) => {
          current?.dispose()
          return meshGeometry(data.positions, data.indices)
        })
      })
      .catch(() => {
        if (cancelled) return
        setGeometry((current) => {
          current?.dispose()
          return null
        })
      })
    return () => {
      cancelled = true
    }
  }, [key, node, segments])

  useEffect(() => {
    return () => {
      setGeometry((current) => {
        current?.dispose()
        return null
      })
    }
  }, [])

  return key ? geometry : null
}

function profileKey(node: FeatureNode): string {
  return JSON.stringify(isProfileNode(node) ? node : null)
}

function meshGeometry(positions: Float32Array, indices: Uint32Array): BufferGeometry {
  const next = new BufferGeometry()
  next.setAttribute('position', new BufferAttribute(positions, 3))
  next.setIndex(new BufferAttribute(indices, 1))
  next.computeVertexNormals()
  return next
}

function checksum(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return String(hash)
}
