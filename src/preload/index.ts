import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IpcChannel, type EditorApi } from '../shared/api'

const api: EditorApi = {
  openscadDetect: () => ipcRenderer.invoke(IpcChannel.openscadDetect),
  previewStl: (source) => ipcRenderer.invoke(IpcChannel.previewStl, source),
  saveProject: (filePath, contents) =>
    ipcRenderer.invoke(IpcChannel.saveProject, filePath, contents),
  openProject: () => ipcRenderer.invoke(IpcChannel.openProject),
  exportScad: (source) => ipcRenderer.invoke(IpcChannel.exportScad, source),
  exportStl: (source) => ipcRenderer.invoke(IpcChannel.exportStl, source)
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
