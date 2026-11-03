import { dialog, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import {
  IpcChannel,
  isSaveProjectRequest,
  isScadAssetList,
  type FileResult,
  type OpenProjectResult,
  type SvgFile
} from '../shared/api'
import { projectLocationFromPick, projectStem } from '../shared/project'
import { detectOpenscad, renderStl } from './openscad'
import {
  createProjectFiles,
  projectExists,
  readProjectTree,
  updateProjectFiles,
  writeProjectScad,
  writeProjectStl
} from './projectFiles'
import { readRecentProjects, rememberProject } from './recents'

export function registerIpc(): void {
  ipcMain.handle(IpcChannel.openscadDetect, () => detectOpenscad())

  ipcMain.handle(IpcChannel.previewStl, (_event, source: unknown, assets: unknown) => {
    if (typeof source !== 'string') return { ok: false, message: 'Fonte inválida.' }
    if (!isScadAssetList(assets)) return { ok: false, message: 'Arquivos SVG inválidos.' }
    return renderStl(source, assets)
  })

  ipcMain.handle(IpcChannel.saveProject, async (_event, request: unknown): Promise<FileResult> => {
    if (!isSaveProjectRequest(request)) return failed('Conteúdo inválido.')
    try {
      if (request.filePath && (await projectExists(request.filePath))) {
        await updateProjectFiles(request.filePath, request.contents, request.source, request.assets)
        await rememberProject(request.filePath)
        return { filePath: request.filePath, message: '', isProject: true }
      }
      const picked = await dialog.showSaveDialog({
        title: 'Salvar projeto',
        buttonLabel: 'Salvar',
        defaultPath: `${projectStem(request.documentName)}.3dev`
      })
      if (picked.canceled || !picked.filePath) return failed('')
      const location = projectLocationFromPick(picked.filePath)
      const jsonPath = await createProjectFiles(
        location.directory,
        location.stem,
        request.contents,
        request.source,
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
    async (_event, jsonPath: unknown, source: unknown, assets: unknown): Promise<FileResult> => {
      if (typeof jsonPath !== 'string' || typeof source !== 'string')
        return failed('Fonte inválida.')
      if (!isScadAssetList(assets)) return failed('Arquivos SVG inválidos.')
      if (!(await projectExists(jsonPath))) return failed('Salve o projeto antes de exportar.')
      try {
        const filePath = await writeProjectScad(jsonPath, source, assets)
        return { filePath, message: '', isProject: true }
      } catch (error) {
        return failed(
          error instanceof Error ? error.message : 'Não foi possível exportar o OpenSCAD.'
        )
      }
    }
  )

  ipcMain.handle(
    IpcChannel.exportStl,
    async (_event, jsonPath: unknown, source: unknown, assets: unknown): Promise<FileResult> => {
      if (typeof jsonPath !== 'string' || typeof source !== 'string')
        return failed('Fonte inválida.')
      if (!isScadAssetList(assets)) return failed('Arquivos SVG inválidos.')
      if (!(await projectExists(jsonPath))) return failed('Salve o projeto antes de exportar.')
      const rendered = await renderStl(source, assets)
      if (!rendered.ok || !rendered.stl) return failed(rendered.message)
      try {
        const filePath = await writeProjectStl(jsonPath, rendered.stl)
        return { filePath, message: '', isProject: true }
      } catch (error) {
        return failed(error instanceof Error ? error.message : 'Não foi possível exportar o STL.')
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

function failed(message: string): FileResult {
  return { filePath: null, message, isProject: false }
}
