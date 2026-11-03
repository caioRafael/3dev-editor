import { useEditor } from '../document/store'
import { parseProjectDocument } from '../document/parse'
import { referencedSvgAssets } from '../document/tree'
import type { FileResult } from '../../../shared/api'
import { readEditorApi } from './editorApi'

export function MenuBar({ source }: { source: string }): React.JSX.Element {
  const filePath = useEditor((state) => state.filePath)
  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-[#2c3240] bg-[#1b1e27] px-2">
      <span className="px-2 text-[13px] font-semibold text-[#f3f5f8]">3dev</span>
      <MenuButton label="Novo" onClick={() => useEditor.getState().newDocument()} />
      <MenuButton label="Abrir" onClick={() => void openProject()} />
      <MenuButton label="Salvar" onClick={() => void saveProject()} />
      <MenuButton label="Exportar SCAD" onClick={() => void exportScad(source)} />
      <MenuButton label="Renderizar" onClick={() => useEditor.getState().requestExactPreview()} />
      <MenuButton label="Exportar STL" onClick={() => void exportStl(source)} />
      <span className="ml-auto truncate px-2 text-[12px] text-[#8b93a3]">
        {filePath ?? 'Sem arquivo'}
      </span>
    </header>
  )
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      className="rounded-md px-2 py-1 text-[12px] text-[#e7e9ee] hover:bg-[#2a3040]"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

async function openProject(): Promise<void> {
  const api = editorApi()
  if (!api) return
  const opened = await api.openProject()
  if (!opened) return
  try {
    const parsed = parseProjectDocument(JSON.parse(opened.contents))
    if (!parsed) {
      useEditor.getState().setStatus('Arquivo inválido.')
      return
    }
    useEditor
      .getState()
      .loadDocument({ ...parsed, name: nameFromPath(opened.filePath) }, opened.filePath)
  } catch {
    useEditor.getState().setStatus('Não foi possível ler o arquivo.')
  }
}

async function saveProject(): Promise<void> {
  const api = editorApi()
  if (!api) return
  const { document, filePath } = useEditor.getState()
  const result = await api.saveProject(filePath, JSON.stringify(document, null, 2))
  applyFileResult(result, 'Modelo salvo.')
}

async function exportScad(source: string): Promise<void> {
  const api = editorApi()
  if (!api) return
  const assets = referencedSvgAssets(useEditor.getState().document)
  applyFileResult(await api.exportScad(source, assets), 'OpenSCAD exportado.')
}

async function exportStl(source: string): Promise<void> {
  const api = editorApi()
  if (!api) return
  useEditor.getState().setStatus('Exportando STL...')
  const assets = referencedSvgAssets(useEditor.getState().document)
  applyFileResult(await api.exportStl(source, assets), 'STL exportado.')
}

function applyFileResult(result: FileResult, success: string): void {
  if (result.filePath) {
    if (success === 'Modelo salvo.') useEditor.getState().setFilePath(result.filePath)
    useEditor.getState().setStatus(success)
    return
  }
  if (result.message) useEditor.getState().setStatus(result.message)
}

function editorApi(): ReturnType<typeof readEditorApi> {
  const api = readEditorApi()
  if (!api) {
    useEditor.getState().setStatus('Arquivos ficam disponíveis no aplicativo Electron.')
    return null
  }
  return api
}

function nameFromPath(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() ?? 'modelo'
  return base.replace(/\.3dev\.json$/i, '').replace(/\.json$/i, '')
}
