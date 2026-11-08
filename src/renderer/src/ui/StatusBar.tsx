import { useEffect, useState } from 'react'
import { useEditor } from '../document/store'
import { readEditorApi } from './editorApi'

export function StatusBar(): React.JSX.Element {
  const status = useEditor((state) => state.status)
  const fn = useEditor((state) => state.document.fn)
  const previewMode = useEditor((state) => state.previewMode)
  const [openscad, setOpenscad] = useState(() =>
    readEditorApi() ? 'OpenSCAD…' : 'OpenSCAD no Electron'
  )

  useEffect(() => {
    const api = readEditorApi()
    if (!api) return
    void api.openscadDetect().then((result) => {
      setOpenscad(result.available ? 'OpenSCAD pronto' : result.message)
    })
  }, [])

  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-[#2c3240] bg-[#1b1e27] px-3 text-[11px] text-[#9aa3b2]">
      <span>mm</span>
      <label className="flex items-center gap-1">
        $fn
        <input
          className="w-14 rounded border border-[#3a4152] bg-[#12141a] px-1 py-0.5 text-[#f2f4f8]"
          value={fn}
          onChange={(event) => useEditor.getState().setFn(Number(event.target.value))}
        />
      </label>
      <button
        type="button"
        className={`rounded px-2 py-0.5 ${previewMode === 'fast' ? 'bg-[#d97757] text-[#1c120e]' : 'hover:bg-[#2a3040]'}`}
        onClick={() => useEditor.getState().setPreviewMode('fast')}
      >
        Prévia rápida
      </button>
      <button
        type="button"
        className={`rounded px-2 py-0.5 ${previewMode === 'openscad' ? 'bg-[#d97757] text-[#1c120e]' : 'hover:bg-[#2a3040]'}`}
        onClick={() => useEditor.getState().requestExactPreview()}
      >
        Prévia exata
      </button>
      <span className="truncate">{openscad}</span>
      <span className="ml-auto truncate text-[#d5d8e0]">{status}</span>
      <span className="hidden xl:inline">
        Esquerdo arrasta orbita · clique seleciona · meio move · roda zoom
      </span>
    </footer>
  )
}
