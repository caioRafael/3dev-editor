import { useEffect, useState } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import { buildCuboidMesh } from './manifoldPreview'
import { type FeatureNode, isCuboidNode } from '../document/types'

export function useCuboidGeometry(node: FeatureNode, segments: number): BufferGeometry | null {
  const key = cuboidKey(node, segments)
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null)

  useEffect(() => {
    if (!key) {
      const timeout = window.setTimeout(() => {
        setGeometry((current) => {
          current?.dispose()
          return null
        })
      }, 0)
      return () => window.clearTimeout(timeout)
    }
    const [x, y, z, rounding, chamfer, segmentCount] = key.split(',').map(Number)
    if (![x, y, z, rounding, chamfer, segmentCount].every((value) => Number.isFinite(value))) {
      return
    }
    let cancelled = false
    buildCuboidMesh({ x, y, z }, rounding, chamfer, segmentCount)
      .then((data) => {
        if (cancelled || data.positions.length === 0) return
        const next = new BufferGeometry()
        next.setAttribute('position', new BufferAttribute(data.positions, 3))
        next.setIndex(new BufferAttribute(data.indices, 1))
        next.computeVertexNormals()
        setGeometry((current) => {
          current?.dispose()
          return next
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
  }, [key])

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

function cuboidKey(node: FeatureNode, segments: number): string {
  if (!isCuboidNode(node) || (node.rounding <= 0 && node.chamfer <= 0)) return ''
  return `${node.size.x},${node.size.y},${node.size.z},${node.rounding},${node.chamfer},${segments}`
}
