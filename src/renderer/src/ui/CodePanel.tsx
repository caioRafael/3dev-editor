import { useEffect, useRef, useState } from 'react'
import type { editor as MonacoEditor } from 'monaco-editor/editor/editor.api.js'
import { generateOpenscad } from '../codegen/openscad'
import { parseOpenscad } from '../codegen/parseOpenscad'
import { useEditor } from '../document/store'
import { registerEditorHistory } from '../editor/editorHistory'
import { createOpenscadEditor, setOpenscadMarkers } from '../editor/openscadEditor'
import { PanelHeader } from './PanelHeader'

const APPLY_DELAY = 320

export function CodePanel({ source }: { source: string }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const sourceRef = useRef(source)
  const appliedRef = useRef(source)
  const generationRef = useRef(0)
  const syncingRef = useRef(false)
  const pendingRef = useRef(false)
  const timerRef = useRef(0)
  const errorRef = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [height, setHeight] = useState(280)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const editor = createOpenscadEditor(container, sourceRef.current)
    editorRef.current = editor

    const setParseError = (message: string | null): void => {
      errorRef.current = message
      setError(message)
    }

    const applyText = (value: string, generation: number): void => {
      pendingRef.current = false
      if (generation !== generationRef.current) return
      const result = parseOpenscad(value, useEditor.getState().document)
      if (!result.ok) {
        setParseError(`Linha ${result.line}: ${result.message}`)
        setOpenscadMarkers(editor, result)
        useEditor.getState().setStatus(result.message)
        return
      }
      const hadError = errorRef.current !== null
      setParseError(null)
      setOpenscadMarkers(editor, null)
      appliedRef.current = generateOpenscad(result.document)
      const before = useEditor.getState().document
      useEditor.getState().applyCode(result.document)
      if (useEditor.getState().document !== before) {
        useEditor.getState().setStatus('Modelo atualizado pelo código')
      } else if (hadError) {
        useEditor.getState().setStatus('Pronto')
      }
    }

    const schedule = (): void => {
      const generation = ++generationRef.current
      pendingRef.current = true
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(
        () => applyText(editor.getValue(), generation),
        APPLY_DELAY
      )
    }

    const content = editor.onDidChangeModelContent(() => {
      if (syncingRef.current) {
        setOpenscadMarkers(editor, null)
        if (errorRef.current) queueMicrotask(() => setParseError(null))
        return
      }
      schedule()
    })
    const unregisterHistory = registerEditorHistory({
      undo: () => editor.trigger('menu', 'undo', null),
      redo: () => editor.trigger('menu', 'redo', null)
    })
    const blur = editor.onDidBlurEditorText(() => {
      if (!pendingRef.current || syncingRef.current) return
      window.clearTimeout(timerRef.current)
      applyText(editor.getValue(), generationRef.current)
    })

    return () => {
      unregisterHistory()
      window.clearTimeout(timerRef.current)
      content.dispose()
      blur.dispose()
      editor.dispose()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || source === appliedRef.current) return
    generationRef.current += 1
    pendingRef.current = false
    window.clearTimeout(timerRef.current)
    appliedRef.current = source
    const position = editor.getPosition()
    const scroll = editor.getScrollTop()
    syncingRef.current = true
    editor.setValue(source)
    if (position) editor.setPosition(position)
    editor.setScrollTop(scroll)
    syncingRef.current = false
  }, [source])

  return (
    <section
      className="flex shrink-0 flex-col border-t border-[#2c3240] bg-[#14171e]"
      style={{ height }}
    >
      <div
        className="h-1 shrink-0 cursor-row-resize bg-[#2c3240] hover:bg-[#d97757]"
        onPointerDown={(event) => startResize(event, height, setHeight)}
      />
      <PanelHeader title="OpenSCAD">
        {error ? (
          <span className="min-w-0 flex-1 truncate font-normal text-[#e07a6a]" title={error}>
            {error}
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate font-normal text-[#6a7384]">
            cuboid, cyl, spheroid, perfis extrudados, booleanos e transforms
          </span>
        )}
        <button
          type="button"
          className="shrink-0 rounded-md px-2 py-0.5 font-normal text-[#f2f4f8] hover:bg-[#2a3040]"
          onClick={() => {
            const value = editorRef.current?.getValue() ?? source
            void navigator.clipboard.writeText(value)
          }}
        >
          Copiar
        </button>
      </PanelHeader>
      <div ref={containerRef} className="min-h-0 w-full flex-1" />
    </section>
  )
}

function startResize(
  event: React.PointerEvent<HTMLDivElement>,
  startHeight: number,
  setHeight: (height: number) => void
): void {
  event.preventDefault()
  const startY = event.clientY
  const onMove = (moveEvent: PointerEvent): void => {
    const next = startHeight - (moveEvent.clientY - startY)
    setHeight(Math.min(560, Math.max(140, next)))
  }
  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
