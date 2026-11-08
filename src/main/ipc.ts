import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import {
  IpcChannel,
  isMeshFormat,
  isProjectScadPath,
  isSaveProjectRequest,
  isScadAssetList,
  isScadFileList,
  isWindowTitle,
  type FileResult,
  type MeshFormat,
  type OpenProjectResult,
  type SvgFile
} from '../shared/api'
import { projectLocationFromPick, projectStem } from '../shared/project'
import { detectOpenscad, renderMesh, renderStl } from './openscad'
import {
  createProjectFiles,
  projectExists,
  readProjectTree,
  updateProjectFiles,
  writeProjectModel,
  writeProjectScad
} from './projectFiles'
import { readRecentProjects, rememberProject } from './recents'

export function registerIpc(): void {
  ipcMain.on(IpcChannel.setWindowTitle, (event, title: unknown) => {
    if (!isWindowTitle(title)) return
    BrowserWindow.fromWebContents(event.sender)?.setTitle(title)
  })

  ipcMain.handle(IpcChannel.openscadDetect, () => detectOpenscad())

  ipcMain.handle(
    IpcChannel.previewStl,
    (_event, entry: unknown, files: unknown, assets: unknown) => {
      if (typeof entry !== 'string' || !isProjectScadPath(entry)) {
        return { ok: false, message: 'Fonte inválida.' }
      }
      if (!isScadFileList(files)) return { ok: false, message: 'Fonte inválida.' }
      if (!isScadAssetList(assets)) return { ok: false, message: 'Arquivos SVG inválidos.' }
      return renderStl(entry, files, assets)
    }
  )

  ipcMain.handle(IpcChannel.saveProject, async (_event, request: unknown): Promise<FileResult> => {
    if (!isSaveProjectRequest(request)) return failed('Conteúdo inválido.')
    try {
      if (request.filePath && (await projectExists(request.filePath))) {
        await updateProjectFiles(request.filePath, request.contents, request.files, request.assets)
        await rememberProject(request.filePath)
        return { filePath: request.filePath, message: '', isProject: true }
      }
      const picked = await dialog.showSaveDialog({
        title: 'Criar projeto',
        buttonLabel: 'Criar',
        defaultPath: `${projectStem(request.documentName)}.3dev`
      })
      if (picked.canceled || !picked.filePath) return failed('')
      const location = projectLocationFromPick(picked.filePath)
      const jsonPath = await createProjectFiles(
        location.directory,
        location.stem,
        request.contents,
        request.files,
        request.assets
      )
      await rememberProject(jsonPath)
      return { filePath: jsonPath, message: '', isProject: true }
    } catch (error) {
      return failed(error instanceof Error ? error.message : 'Não foi possível gravar o projeto.')
    }
  })

  ipcMain.handle(IpcChannel.openProject, async (): Promise<OpenProjectResult | null> => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Projeto 3dev', extensions: ['json'] }],
      properties: ['openFile']
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return null
    return readOpenedProject(filePath)
  })

  ipcMain.handle(IpcChannel.openRecentProject, async (_event, jsonPath: unknown) => {
    if (typeof jsonPath !== 'string' || !jsonPath.endsWith('.json')) return null
    const listed = await readRecentProjects()
    if (!listed.some((project) => project.jsonPath === jsonPath)) return null
    return readOpenedProject(jsonPath)
  })

  ipcMain.handle(IpcChannel.listRecentProjects, () => readRecentProjects())

  ipcMain.handle(IpcChannel.listProjectTree, (_event, jsonPath: unknown) => {
    if (typeof jsonPath !== 'string' || !jsonPath.endsWith('.json')) return null
    return readProjectTree(jsonPath)
  })

  ipcMain.handle(
    IpcChannel.exportScad,
    async (_event, jsonPath: unknown, files: unknown, assets: unknown): Promise<FileResult> => {
      if (typeof jsonPath !== 'string' || !isScadFileList(files)) return failed('Fonte inválida.')
      if (!isScadAssetList(assets)) return failed('Arquivos SVG inválidos.')
      if (!(await projectExists(jsonPath))) return failed('Salve o projeto antes de exportar.')
      try {
        const filePath = await writeProjectScad(jsonPath, files, assets)
        return { filePath, message: '', isProject: true }
      } catch (error) {
        return failed(
          error instanceof Error ? error.message : 'Não foi possível exportar o OpenSCAD.'
        )
      }
    }
  )

  ipcMain.handle(
    IpcChannel.exportModel,
    async (
      _event,
      jsonPath: unknown,
      files: unknown,
      assets: unknown,
      format: unknown
    ): Promise<FileResult> => {
      if (typeof jsonPath !== 'string' || !isScadFileList(files)) return failed('Fonte inválida.')
      if (!isScadAssetList(assets)) return failed('Arquivos SVG inválidos.')
      if (!isMeshFormat(format)) return failed('Formato inválido.')
      if (!(await projectExists(jsonPath))) return failed('Salve o projeto antes de exportar.')
      const rendered = await renderMesh('main.scad', files, assets, format)
      if (!rendered.ok || rendered.files.length === 0) return failed(rendered.message)
      try {
        const written = await writeProjectModel(jsonPath, format, rendered.files)
        return {
          filePath: written.filePath,
          message: written.missingMaterial ? 'OBJ exportado sem material de cor.' : '',
          isProject: true
        }
      } catch (error) {
        return failed(error instanceof Error ? error.message : exportError(format))
      }
    }
  )

  ipcMain.handle(IpcChannel.pickSvg, async (): Promise<SvgFile | null> => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'SVG', extensions: ['svg'] }],
      properties: ['openFile']
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return null
    const source = await readFile(filePath, 'utf8')
    if (source.length > 1_500_000) return { name: basename(filePath), source: '' }
    return { name: basename(filePath), source }
  })
}

async function readOpenedProject(filePath: string): Promise<OpenProjectResult | null> {
  try {
    const contents = await readFile(filePath, 'utf8')
    const isProject = await projectExists(filePath)
    await rememberProject(filePath)
    return { filePath, contents, isProject }
  } catch {
    return null
  }
}

function exportError(format: MeshFormat): string {
  if (format === 'obj') return 'Não foi possível exportar o OBJ.'
  if (format === '3mf') return 'Não foi possível exportar o 3MF.'
  return 'Não foi possível exportar o STL.'
}

function failed(message: string): FileResult {
  return { filePath: null, message, isProject: false }
}
