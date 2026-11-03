import { useEffect, useState } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import { requestBooleanMesh } from './booleanClient'
import { buildBooleanMesh, subtreeKey, type SolidMeshData } from './manifoldPreview'
import { useEditor } from '../document/store'
import { type ProjectDocument, isBooleanNode } from '../document/types'

export function useBooleanGeometry(nodeId: string): BufferGeometry | null {
  const document = useEditor((state) => state.document)
  const node = document.nodes[nodeId]
  const key = node && isBooleanNode(node) ? subtreeKey(document, node) : ''
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null)

  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    let stage: 'base' | 'rounded' = 'base'
    const current = useEditor.getState().document
    const roundEdges = needsEdgeRounding(current, nodeId)
    const show = (data: SolidMeshData | null, rounded: boolean): void => {
      if (cancelled || !data || data.positions.length === 0) return
      if (!rounded && stage === 'rounded') return
      if (rounded) stage = 'rounded'
      const next = meshGeometry(data)
      setGeometry((currentGeometry) => {
        currentGeometry?.dispose()
        return next
      })
    }

    void buildBooleanMesh(current, nodeId, false)
      .then((data) => show(data, false))
      .catch((error: unknown) => {
        if (cancelled) return
        useEditor.getState().setStatus(messageFrom(error))
      })

    if (!roundEdges) {
      return () => {
        cancelled = true
      }
    }

    useEditor.getState().setStatus('Arredondando…')
    useEditor.getState().beginPreview('Arredondando…')
    let closed = false
    const finishPreview = (): void => {
      if (closed) return
      closed = true
      useEditor.getState().endPreview()
    }
    const timeout = window.setTimeout(() => {
      requestBooleanMesh(useEditor.getState().document, nodeId)
        .then((data) => {
          if (cancelled) return
          if (!data || data.positions.length === 0) {
            useEditor.getState().setStatus('A operação booleana não gerou sólido.')
            return
          }
          show(data, true)
          if (useEditor.getState().status === 'Arredondando…') {
            useEditor.getState().setStatus('Pronto')
          }
        })
        .catch((error: unknown) => {
          if (cancelled) return
          useEditor.getState().setStatus(messageFrom(error))
        })
        .finally(finishPreview)
    }, 120)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      finishPreview()
    }
  }, [key, nodeId])

  useEffect(() => {
    return () => {
      setGeometry((current) => {
        current?.dispose()
        return null
      })
    }
  }, [])

  return geometry
}

function needsEdgeRounding(document: ProjectDocument, nodeId: string): boolean {
  const node = document.nodes[nodeId]
  if (!node || !isBooleanNode(node)) return false
  if (node.rounding > 0) return true
  return node.childIds.some((id) => needsEdgeRounding(document, id))
}

function meshGeometry(data: SolidMeshData): BufferGeometry {
  const next = new BufferGeometry()
  next.setAttribute('position', new BufferAttribute(data.positions, 3))
  next.setIndex(new BufferAttribute(data.indices, 1))
  next.computeVertexNormals()
  return next
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Falha na prévia booleana.'
}
