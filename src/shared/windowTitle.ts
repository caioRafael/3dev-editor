const APP_TITLE = '3dev editor'

export function formatWindowTitle(filePath: string | null, isProject: boolean): string {
  const label = projectLabel(filePath, isProject)
  if (!label) return APP_TITLE
  return `${clip(label)} — ${APP_TITLE}`
}

function projectLabel(filePath: string | null, isProject: boolean): string | null {
  if (!filePath) return null
  if (isProject) return folderName(filePath)
  return baseName(filePath)
}

function folderName(filePath: string): string {
  const parts = pathParts(filePath)
  return parts.length >= 2 ? (parts[parts.length - 2] ?? 'Sem arquivo') : 'Sem arquivo'
}

function baseName(filePath: string): string {
  const parts = pathParts(filePath)
  return parts[parts.length - 1] ?? 'Sem arquivo'
}

function pathParts(filePath: string): string[] {
  return filePath.split(/[/\\]/).filter((part) => part.length > 0)
}

function clip(label: string): string {
  if (label.length <= 120) return label
  return `${label.slice(0, 117)}…`
}
