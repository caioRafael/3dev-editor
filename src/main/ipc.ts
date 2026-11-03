import { dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { IpcChannel, type FileResult, type OpenProjectResult } from '../shared/api'
import { renderStl, detectOpenscad } from './openscad'

export function registerIpc(): void {
  ipcMain.handle(IpcChannel.openscadDetect, () => detectOpenscad())

  ipcMain.handle(IpcChannel.previewStl, (_event, source: unknown) => {
    if (typeof source !== 'string') return { ok: false, message: 'Fonte inválida.' }
    return renderStl(source)
  })

  ipcMain.handle(IpcChannel.saveProject, async (_event, filePath: unknown, contents: unknown) => {
    if (typeof contents !== 'string') return { filePath: null, message: 'Conteúdo inválido.' }
    return writeWithDialog(typeof filePath === 'string' ? filePath : null, contents, {
      defaultPath: 'model.3dev.json',
      filters: [{ name: 'Projeto 3dev', extensions: ['json'] }]
    })
  })

  ipcMain.handle(IpcChannel.openProject, async (): Promise<OpenProjectResult | null> => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Projeto 3dev', extensions: ['json'] }],
      properties: ['openFile']
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return null
    const contents = await readFile(filePath, 'utf8')
    return { filePath, contents }
  })

  ipcMain.handle(IpcChannel.exportScad, async (_event, source: unknown) => {
    if (typeof source !== 'string') return { filePath: null, message: 'Fonte inválida.' }
    return writeWithDialog(null, source, {
      defaultPath: 'model.scad',
      filters: [{ name: 'OpenSCAD', extensions: ['scad'] }]
    })
  })

  ipcMain.handle(IpcChannel.exportStl, async (_event, source: unknown): Promise<FileResult> => {
    if (typeof source !== 'string') return { filePath: null, message: 'Fonte inválida.' }
    const result = await dialog.showSaveDialog({
      defaultPath: 'model.stl',
      filters: [{ name: 'STL', extensions: ['stl'] }]
    })
    if (result.canceled || !result.filePath) return { filePath: null, message: '' }
    const rendered = await renderStl(source)
    if (!rendered.ok || !rendered.stl) return { filePath: null, message: rendered.message }
    await writeFile(result.filePath, rendered.stl)
    return { filePath: result.filePath, message: '' }
  })
}

async function writeWithDialog(
  filePath: string | null,
  contents: string,
  options: Electron.SaveDialogOptions
): Promise<FileResult> {
  let target = filePath
  if (!target) {
    const result = await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { filePath: null, message: '' }
    target = result.filePath
  }
  await writeFile(target, contents, 'utf8')
  return { filePath: target, message: '' }
}
