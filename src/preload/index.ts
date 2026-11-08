import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IpcChannel, type EditorApi } from '../shared/api'

const api: EditorApi = {
  openscadDetect: () => ipcRenderer.invoke(IpcChannel.openscadDetect),
  previewStl: (entry, files, assets) =>
    ipcRenderer.invoke(IpcChannel.previewStl, entry, files, assets),
  saveProject: (request) => ipcRenderer.invoke(IpcChannel.saveProject, request),
  openProject: () => ipcRenderer.invoke(IpcChannel.openProject),
  exportScad: (jsonPath, files, assets) =>
    ipcRenderer.invoke(IpcChannel.exportScad, jsonPath, files, assets),
  exportModel: (jsonPath, files, assets, format) =>
    ipcRenderer.invoke(IpcChannel.exportModel, jsonPath, files, assets, format),
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
