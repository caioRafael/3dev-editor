import { generateProjectSources } from '../codegen/openscad'
import { parseProjectDocument } from '../document/parse'
import { useEditor } from '../document/store'
import { createEmptyDocument, referencedSvgAssets } from '../document/tree'
import type { EditorApi, FileResult, OpenProjectResult } from '../../../shared/api'
import { readEditorApi } from './editorApi'

export interface ActionResult {
  ok: boolean
  message: string
}

export async function createProject(): Promise<ActionResult> {
  const api = requireApi()
  if (!api) return unavailable()
  const document = createEmptyDocument()
  try {
    const result = await api.saveProject({
      filePath: null,
      documentName: document.name,
      contents: JSON.stringify(document, null, 2),
      files: generateProjectSources(document),
      assets: []
    })
    if (!result.filePath) return { ok: false, message: result.message }
    useEditor
      .getState()
      .loadDocument({ ...document, name: nameFromPath(result.filePath) }, result.filePath, true)
    useEditor.getState().setStatus('Projeto criado.')
    return { ok: true, message: '' }
  } catch {
    return failed('Não foi possível gravar o projeto.')
  }
}

export async function openProjectFile(): Promise<ActionResult> {
  const api = requireApi()
  if (!api) return unavailable()
  try {
    const opened = await api.openProject()
    if (!opened) return { ok: false, message: '' }
    return applyOpened(opened)
  } catch {
    return failed('Não foi possível ler o arquivo.')
  }
}

export async function openRecentProjectFile(jsonPath: string): Promise<ActionResult> {
  const api = requireApi()
  if (!api) return unavailable()
  try {
    const opened = await api.openRecentProject(jsonPath)
    if (!opened) return failed('Projeto não encontrado.')
    return applyOpened(opened)
  } catch {
    return failed('Não foi possível ler o arquivo.')
  }
}

export async function saveCurrentProject(): Promise<ActionResult> {
  const api = requireApi()
  if (!api) return unavailable()
  const { document, filePath, isProject } = useEditor.getState()
  try {
    const result = await api.saveProject({
      filePath: isProject ? filePath : null,
      documentName: document.name,
      contents: JSON.stringify(document, null, 2),
      files: generateProjectSources(document),
      assets: referencedSvgAssets(document)
    })
    return applySaved(result, 'Modelo salvo.')
  } catch {
    return failed('Não foi possível gravar o projeto.')
  }
}

export async function exportCurrentScad(): Promise<void> {
  const ready = await ensureProject()
  if (!ready.ok) {
    if (ready.message) useEditor.getState().setStatus(ready.message)
    return
  }
  const api = requireApi()
  const filePath = useEditor.getState().filePath
  if (!api || !filePath) return
  const assets = referencedSvgAssets(useEditor.getState().document)
  try {
    const result = await api.exportScad(
      filePath,
      generateProjectSources(useEditor.getState().document),
      assets
    )
    applyExport(result, 'OpenSCAD exportado.')
  } catch {
    useEditor.getState().setStatus('Não foi possível exportar o OpenSCAD.')
  }
}

export async function exportCurrentStl(): Promise<void> {
  const ready = await ensureProject()
  if (!ready.ok) {
    if (ready.message) useEditor.getState().setStatus(ready.message)
    return
  }
  const api = requireApi()
  const filePath = useEditor.getState().filePath
  if (!api || !filePath) return
  useEditor.getState().setStatus('Exportando STL...')
  const assets = referencedSvgAssets(useEditor.getState().document)
  try {
    const result = await api.exportStl(
      filePath,
      generateProjectSources(useEditor.getState().document),
      assets
    )
    applyExport(result, 'STL exportado.')
  } catch {
    useEditor.getState().setStatus('Não foi possível exportar o STL.')
  }
}

async function ensureProject(): Promise<ActionResult> {
  const { filePath, isProject } = useEditor.getState()
  if (filePath && isProject) return { ok: true, message: '' }
  return saveCurrentProject()
}

function applySaved(result: FileResult, success: string): ActionResult {
  if (!result.filePath) return { ok: false, message: result.message }
  useEditor.getState().setProject(result.filePath, result.isProject)
  useEditor.getState().setStatus(success)
  return { ok: true, message: '' }
}

function applyExport(result: FileResult, success: string): void {
  if (!result.filePath) {
    if (result.message) useEditor.getState().setStatus(result.message)
    return
  }
  useEditor.getState().touchFiles()
  useEditor.getState().setStatus(success)
}

function applyOpened(opened: OpenProjectResult): ActionResult {
  try {
    const parsed = parseProjectDocument(JSON.parse(opened.contents))
    if (!parsed) return failed('Arquivo inválido.')
    useEditor
      .getState()
      .loadDocument(
        { ...parsed, name: nameFromPath(opened.filePath) },
        opened.filePath,
        opened.isProject
      )
    return { ok: true, message: '' }
  } catch {
    return failed('Não foi possível ler o arquivo.')
  }
}

function requireApi(): EditorApi | null {
  const api = readEditorApi()
  if (!api) useEditor.getState().setStatus('Arquivos ficam disponíveis no aplicativo Electron.')
  return api
}

function unavailable(): ActionResult {
  return { ok: false, message: 'Arquivos ficam disponíveis no aplicativo Electron.' }
}

function failed(message: string): ActionResult {
  useEditor.getState().setStatus(message)
  return { ok: false, message }
}

function nameFromPath(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() ?? 'modelo'
  return base.replace(/\.3dev\.json$/i, '').replace(/\.json$/i, '') || 'modelo'
}
