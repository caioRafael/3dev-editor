import { type FeatureNode, type ModelFile, type ProjectDocument, isComponentNode } from './types'

export const MAIN_FILE = 'main'

const COMPONENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

const RESERVED_NAMES = new Set([
  'main',
  'cuboid',
  'cyl',
  'spheroid',
  'union',
  'difference',
  'intersection',
  'color',
  'translate',
  'rotate',
  'scale',
  'round3d'
])

export function emptyModel(): ModelFile {
  return { nodes: {}, assets: {} }
}

export function activeModel(document: ProjectDocument): ModelFile {
  return document.files[document.activeFile] ?? emptyModel()
}

export function replaceActive(document: ProjectDocument, model: ModelFile): ProjectDocument {
  const activeFile = document.files[document.activeFile] ? document.activeFile : MAIN_FILE
  return {
    ...document,
    activeFile,
    files: { ...document.files, [activeFile]: model }
  }
}

export function componentNames(document: ProjectDocument): string[] {
  return Object.keys(document.files)
    .filter((name) => name !== MAIN_FILE)
    .sort((left, right) => left.localeCompare(right))
}

export function orderedFileNames(document: ProjectDocument): string[] {
  return [MAIN_FILE, ...componentNames(document)].filter((name) => document.files[name])
}

export function validateComponentName(document: ProjectDocument, rawName: string): string | null {
  const name = rawName.trim()
  if (!name) return 'Informe um nome.'
  if (!COMPONENT_NAME.test(name)) return 'Use letras, números e _; comece com letra ou _.'
  if (RESERVED_NAMES.has(name.toLowerCase())) return 'Esse nome é reservado.'
  const taken = Object.keys(document.files).some((key) => key.toLowerCase() === name.toLowerCase())
  if (taken) return 'Já existe um componente com esse nome.'
  return null
}

export function componentDependencies(document: ProjectDocument, fileName: string): string[] {
  const file = document.files[fileName]
  if (!file) return []
  const names = new Set<string>()
  for (const node of Object.values(file.nodes)) {
    if (isComponentNode(node)) names.add(node.componentName)
  }
  return [...names]
}

export function introducesCycle(
  document: ProjectDocument,
  host: string,
  componentName: string
): boolean {
  if (host === componentName) return true
  return reaches(document, componentName, host, new Set())
}

export function scadRelativePath(fromFile: string, componentName: string): string {
  if (fromFile === MAIN_FILE) return `components/${componentName}.scad`
  return `${componentName}.scad`
}

export function assetRelativePrefix(fileName: string): string {
  return fileName === MAIN_FILE ? '3dev-assets/' : '../3dev-assets/'
}

export function projectEntryPath(fileName: string): string {
  return fileName === MAIN_FILE ? 'main.scad' : `components/${fileName}.scad`
}

function reaches(
  document: ProjectDocument,
  from: string,
  target: string,
  seen: Set<string>
): boolean {
  if (from === target) return true
  if (seen.has(from)) return false
  seen.add(from)
  for (const next of componentDependencies(document, from)) {
    if (reaches(document, next, target, seen)) return true
  }
  return false
}

export function componentNamesIn(nodes: Record<string, FeatureNode>): string[] {
  const names = new Set<string>()
  for (const node of Object.values(nodes)) {
    if (node.visible && isComponentNode(node)) names.add(node.componentName)
  }
  return [...names].sort((left, right) => left.localeCompare(right))
}
