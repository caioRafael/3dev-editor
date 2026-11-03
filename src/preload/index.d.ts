import { ElectronAPI } from '@electron-toolkit/preload'
import type { EditorApi } from '../shared/api'

declare global {
  interface Window {
    electron: ElectronAPI
    api: EditorApi
  }
}
