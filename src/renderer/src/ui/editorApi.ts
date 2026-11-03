import type { EditorApi } from '../../../shared/api'

export function readEditorApi(): EditorApi | null {
  const candidate: unknown = window.api
  if (!isEditorApi(candidate)) return null
  return candidate
}

function isEditorApi(value: unknown): value is EditorApi {
  if (typeof value !== 'object' || value === null) return false
  return (
    'previewStl' in value &&
    'saveProject' in value &&
    'openscadDetect' in value &&
    'listProjectTree' in value &&
    'listRecentProjects' in value
  )
}
