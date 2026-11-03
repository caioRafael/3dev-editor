import { mkdir, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import type { ProjectEntry, ProjectTree, ScadAsset } from '../shared/api'
import {
  CODE_DIRECTORY,
  OUTPUT_DIRECTORY,
  compareNamedEntries,
  isProjectLayout,
  projectFolderName,
  projectPaths,
  stemFromJsonPath
} from '../shared/project'

const MAX_TREE_DEPTH = 6

export async function writeAssets(directory: string, assets: ScadAsset[]): Promise<void> {
  if (assets.length === 0) return
  const assetDirectory = join(directory, '3dev-assets')
  await mkdir(assetDirectory, { recursive: true })
  for (const asset of assets) {
    await writeFile(join(assetDirectory, `${asset.id}.svg`), asset.source, 'utf8')
  }
}

export async function createProjectFiles(
  directory: string,
  stem: string,
  contents: string,
  source: string,
  assets: ScadAsset[]
): Promise<string> {
  const existing = await stat(directory).catch(() => null)
  if (existing && !existing.isDirectory()) throw new Error('Escolha um nome de pasta.')
  const paths = projectPaths(directory, stem)
  await mkdir(paths.codeDirectory, { recursive: true })
  await mkdir(paths.outputDirectory, { recursive: true })
  await writeFile(paths.jsonPath, contents, 'utf8')
  await writeFile(paths.scadPath, source, 'utf8')
  await writeAssets(paths.codeDirectory, assets)
  return paths.jsonPath
}

export async function updateProjectFiles(
  jsonPath: string,
  contents: string,
  source: string,
  assets: ScadAsset[]
): Promise<void> {
  const paths = projectPaths(dirname(jsonPath), stemFromJsonPath(jsonPath))
  await mkdir(paths.codeDirectory, { recursive: true })
  await mkdir(paths.outputDirectory, { recursive: true })
  await writeFile(jsonPath, contents, 'utf8')
  await writeFile(paths.scadPath, source, 'utf8')
  await writeAssets(paths.codeDirectory, assets)
}

export async function writeProjectScad(
  jsonPath: string,
  source: string,
  assets: ScadAsset[]
): Promise<string> {
  const paths = projectPaths(dirname(jsonPath), stemFromJsonPath(jsonPath))
  await mkdir(paths.codeDirectory, { recursive: true })
  await writeFile(paths.scadPath, source, 'utf8')
  await writeAssets(paths.codeDirectory, assets)
  return paths.scadPath
}

export async function writeProjectStl(jsonPath: string, stl: Uint8Array): Promise<string> {
  const paths = projectPaths(dirname(jsonPath), stemFromJsonPath(jsonPath))
  await mkdir(paths.outputDirectory, { recursive: true })
  await writeFile(paths.stlPath, stl)
  return paths.stlPath
}

export async function projectExists(jsonPath: string): Promise<boolean> {
  return (await readProjectTree(jsonPath))?.isProject ?? false
}

export async function readProjectTree(jsonPath: string): Promise<ProjectTree | null> {
  if (!(await isFile(jsonPath))) return null
  const directory = dirname(jsonPath)
  const code = await containedDirectory(directory, CODE_DIRECTORY)
  const output = await containedDirectory(directory, OUTPUT_DIRECTORY)
  const isProject = isProjectLayout({
    json: true,
    code: code !== null,
    output: output !== null
  })
  return {
    rootName: projectFolderName(jsonPath),
    jsonName: basename(jsonPath),
    isProject,
    code: code ? await listDirectory(code, 0) : [],
    output: output ? await listDirectory(output, 0) : []
  }
}

async function listDirectory(directory: string, depth: number): Promise<ProjectEntry[]> {
  let dirents
  try {
    dirents = await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
  const entries: ProjectEntry[] = []
  for (const dirent of dirents) {
    if (dirent.isSymbolicLink()) {
      entries.push({ name: dirent.name, kind: 'file', children: [] })
      continue
    }
    const isDirectory = dirent.isDirectory()
    const children =
      isDirectory && depth + 1 < MAX_TREE_DEPTH
        ? await listDirectory(join(directory, dirent.name), depth + 1)
        : []
    entries.push({
      name: dirent.name,
      kind: isDirectory ? 'directory' : 'file',
      children
    })
  }
  entries.sort(compareNamedEntries)
  return entries
}

async function containedDirectory(parent: string, name: string): Promise<string | null> {
  try {
    const root = await realpath(parent)
    const resolved = await realpath(join(parent, name))
    const info = await stat(resolved)
    if (!info.isDirectory() || !isInside(root, resolved)) return null
    return resolved
  } catch {
    return null
  }
}

function isInside(root: string, target: string): boolean {
  const relativePath = relative(root, target)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath)
    return info.isFile()
  } catch {
    return false
  }
}
