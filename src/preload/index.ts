import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IpcChannel, type EditorApi } from '../shared/api'

const api: EditorApi = {
  openscadDetect: () => ipcRenderer.invoke(IpcChannel.openscadDetect),
  previewStl: (source, assets) => ipcRenderer.invoke(IpcChannel.previewStl, source, assets),
  saveProject: (filePath, contents) =>
    ipcRenderer.invoke(IpcChannel.saveProject, filePath, contents),
  openProject: () => ipcRenderer.invoke(IpcChannel.openProject),
  exportScad: (source, assets) => ipcRenderer.invoke(IpcChannel.exportScad, source, assets),
  exportStl: (source, assets) => ipcRenderer.invoke(IpcChannel.exportStl, source, assets),
  pickSvg: () => ipcRenderer.invoke(IpcChannel.pickSvg)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  Object.assign(globalThis, { electron: electronAPI, api })
}
