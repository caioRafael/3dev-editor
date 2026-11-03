export const IpcChannel = {
  openscadDetect: 'openscad:detect',
  previewStl: 'preview:stl',
  saveProject: 'project:save',
  openProject: 'project:open',
  exportScad: 'export:scad',
  exportStl: 'export:stl'
} as const

export interface OpenscadStatus {
  available: boolean
  command: string | null
  message: string
}

export interface PreviewStlResult {
  ok: boolean
  message: string
  stl?: Uint8Array
}

export interface OpenProjectResult {
  filePath: string
  contents: string
}

export interface FileResult {
  filePath: string | null
  message: string
}

export interface EditorApi {
  openscadDetect: () => Promise<OpenscadStatus>
  previewStl: (source: string) => Promise<PreviewStlResult>
  saveProject: (filePath: string | null, contents: string) => Promise<FileResult>
  openProject: () => Promise<OpenProjectResult | null>
  exportScad: (source: string) => Promise<FileResult>
  exportStl: (source: string) => Promise<FileResult>
}
