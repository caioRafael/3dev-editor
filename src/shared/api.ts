export const IpcChannel = {
  openscadDetect: 'openscad:detect',
  previewStl: 'preview:stl',
  saveProject: 'project:save',
  openProject: 'project:open',
  exportScad: 'export:scad',
  exportModel: 'export:model',
  pickSvg: 'asset:pick-svg',
  listProjectTree: 'project:tree',
  listRecentProjects: 'project:recent',
  openRecentProject: 'project:open-recent'
} as const

const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ScadAsset {
  id: string
  source: string
}

export interface ScadFile {
  path: string
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
  isProject: boolean
}

export type MeshFormat = 'stl' | 'obj' | '3mf'

export interface FileResult {
  filePath: string | null
  message: string
  isProject: boolean
}

export interface SaveProjectRequest {
  filePath: string | null
  documentName: string
  contents: string
  files: ScadFile[]
  assets: ScadAsset[]
}

export interface ProjectEntry {
  name: string
  kind: 'file' | 'directory'
  children: ProjectEntry[]
}

export interface ProjectTree {
  rootName: string
  jsonName: string
  isProject: boolean
  code: ProjectEntry[]
  output: ProjectEntry[]
}

export interface RecentProject {
  name: string
  jsonPath: string
}

export interface EditorApi {
  openscadDetect: () => Promise<OpenscadStatus>
  previewStl: (entry: string, files: ScadFile[], assets: ScadAsset[]) => Promise<PreviewStlResult>
  saveProject: (request: SaveProjectRequest) => Promise<FileResult>
  openProject: () => Promise<OpenProjectResult | null>
  exportScad: (jsonPath: string, files: ScadFile[], assets: ScadAsset[]) => Promise<FileResult>
  exportModel: (
    jsonPath: string,
    files: ScadFile[],
    assets: ScadAsset[],
    format: MeshFormat
  ) => Promise<FileResult>
  pickSvg: () => Promise<SvgFile | null>
  listProjectTree: (jsonPath: string) => Promise<ProjectTree | null>
  listRecentProjects: () => Promise<RecentProject[]>
  openRecentProject: (jsonPath: string) => Promise<OpenProjectResult | null>
}

export function isScadAssetList(value: unknown): value is ScadAsset[] {
  return Array.isArray(value) && value.every((item) => isScadAsset(item))
}

export function isScadFileList(value: unknown): value is ScadFile[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => isScadFile(item))
}

export function isMeshFormat(value: unknown): value is MeshFormat {
  return value === 'stl' || value === 'obj' || value === '3mf'
}

export function isProjectScadPath(path: string): boolean {
  return path === 'main.scad' || /^components\/[A-Za-z_][A-Za-z0-9_]*\.scad$/.test(path)
}

export function isSaveProjectRequest(value: unknown): value is SaveProjectRequest {
  if (typeof value !== 'object' || value === null) return false
  if (
    !('filePath' in value) ||
    !('documentName' in value) ||
    !('contents' in value) ||
    !('files' in value) ||
    !('assets' in value)
  ) {
    return false
  }
  const filePathOk = value.filePath === null || typeof value.filePath === 'string'
  return (
    filePathOk &&
    typeof value.documentName === 'string' &&
    typeof value.contents === 'string' &&
    isScadFileList(value.files) &&
    isScadAssetList(value.assets)
  )
}

function isScadFile(value: unknown): value is ScadFile {
  if (typeof value !== 'object' || value === null) return false
  if (!('path' in value) || !('source' in value)) return false
  return (
    typeof value.path === 'string' &&
    isProjectScadPath(value.path) &&
    typeof value.source === 'string'
  )
}

function isScadAsset(value: unknown): value is ScadAsset {
  if (typeof value !== 'object' || value === null) return false
  if (!('id' in value) || !('source' in value)) return false
  return typeof value.id === 'string' && ASSET_ID.test(value.id) && typeof value.source === 'string'
}
