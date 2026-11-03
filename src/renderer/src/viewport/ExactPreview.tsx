import { useEffect, useState } from 'react'
import { BufferGeometry, MeshStandardMaterial } from 'three'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { useEditor } from '../document/store'
import { referencedSvgAssets } from '../document/tree'

const loader = new STLLoader()
const material = new MeshStandardMaterial({ color: '#d7dde6', metalness: 0.08, roughness: 0.48 })

export function ExactPreview({ source }: { source: string }): React.JSX.Element | null {
  const previewMode = useEditor((state) => state.previewMode)
  const previewNonce = useEditor((state) => state.previewNonce)
  const assetKey = useEditor((state) =>
    referencedSvgAssets(state.document)
      .map((asset) => `${asset.id}:${asset.source.length}`)
      .join('|')
  )
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null)

  useEffect(() => {
    if (previewMode !== 'openscad') return undefined
    const api = window.api
    if (!api?.previewStl) {
      useEditor.getState().setStatus('A prévia exata roda no aplicativo Electron.')
      return undefined
    }
    let cancelled = false
    const timer = window.setTimeout(
      () => {
        useEditor.getState().setStatus('Renderizando com OpenSCAD...')
        const assets = referencedSvgAssets(useEditor.getState().document)
        void api
          .previewStl(source, assets)
          .then((result) => {
            if (cancelled) return
            const bytes = result.stl ? normalizeBytes(result.stl) : null
            if (!result.ok || !bytes) {
              useEditor.getState().setStatus(result.message || 'OpenSCAD não gerou STL.')
              return
            }
            const next = loader.parse(copyArrayBuffer(bytes))
            next.computeVertexNormals()
            setGeometry((current) => {
              current?.dispose()
              return next
            })
            useEditor.getState().setStatus('Prévia exata atualizada.')
          })
          .catch((error: unknown) => {
            if (cancelled) return
            useEditor
              .getState()
              .setStatus(error instanceof Error ? error.message : 'Falha na prévia exata.')
          })
      },
      previewNonce > 0 ? 0 : 400
    )
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [previewMode, previewNonce, source, assetKey])

  useEffect(() => {
    return () => {
      setGeometry((current) => {
        current?.dispose()
        return null
      })
    }
  }, [])

  if (previewMode !== 'openscad' || !geometry) return null
  return <mesh geometry={geometry} material={material} />
}

function normalizeBytes(value: Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value)
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}
