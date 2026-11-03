export const IpcChannel = {
  openscadDetect: 'openscad:detect',
  previewStl: 'preview:stl',
  saveProject: 'project:save',
  openProject: 'project:open',
  exportScad: 'export:scad',
  exportStl: 'export:stl',
  pickSvg: 'asset:pick-svg'
} as const

const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ScadAsset {
  id: string
  source: string
}

export interface SvgFile {
  name: string
  source: string
}

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
  previewStl: (source: string, assets: ScadAsset[]) => Promise<PreviewStlResult>
  saveProject: (filePath: string | null, contents: string) => Promise<FileResult>
  openProject: () => Promise<OpenProjectResult | null>
  exportScad: (source: string, assets: ScadAsset[]) => Promise<FileResult>
  exportStl: (source: string, assets: ScadAsset[]) => Promise<FileResult>
  pickSvg: () => Promise<SvgFile | null>
}

export function isScadAssetList(value: unknown): value is ScadAsset[] {
  return Array.isArray(value) && value.every((item) => isScadAsset(item))
}

function isScadAsset(value: unknown): value is ScadAsset {
  if (typeof value !== 'object' || value === null) return false
  if (!('id' in value) || !('source' in value)) return false
  return typeof value.id === 'string' && ASSET_ID.test(value.id) && typeof value.source === 'string'
}
