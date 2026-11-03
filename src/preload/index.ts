import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IpcChannel, type EditorApi } from '../shared/api'

const api: EditorApi = {
  openscadDetect: () => ipcRenderer.invoke(IpcChannel.openscadDetect),
  previewStl: (source, assets) => ipcRenderer.invoke(IpcChannel.previewStl, source, assets),
  saveProject: (request) => ipcRenderer.invoke(IpcChannel.saveProject, request),
  openProject: () => ipcRenderer.invoke(IpcChannel.openProject),
  exportScad: (jsonPath, source, assets) =>
    ipcRenderer.invoke(IpcChannel.exportScad, jsonPath, source, assets),
  exportStl: (jsonPath, source, assets) =>
    ipcRenderer.invoke(IpcChannel.exportStl, jsonPath, source, assets),
  pickSvg: () => ipcRenderer.invoke(IpcChannel.pickSvg),
  listProjectTree: (jsonPath) => ipcRenderer.invoke(IpcChannel.listProjectTree, jsonPath),
  listRecentProjects: () => ipcRenderer.invoke(IpcChannel.listRecentProjects),
  openRecentProject: (jsonPath) => ipcRenderer.invoke(IpcChannel.openRecentProject, jsonPath)
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
