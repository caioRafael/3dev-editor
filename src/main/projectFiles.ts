import { mkdir, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import type { MeshFormat, ProjectEntry, ProjectTree, ScadAsset, ScadFile } from '../shared/api'
import { isProjectScadPath } from '../shared/api'
import {
  CODE_DIRECTORY,
  OUTPUT_DIRECTORY,
  compareNamedEntries,
  isProjectLayout,
  objWithProjectMaterial,
  projectFolderName,
  projectPaths,
  stemFromJsonPath
} from '../shared/project'
import { svgSourceForOpenscad } from '../shared/svg'

const MAX_TREE_DEPTH = 6

export async function writeAssets(directory: string, assets: ScadAsset[]): Promise<void> {
  if (assets.length === 0) return
  const assetDirectory = join(directory, '3dev-assets')
  await mkdir(assetDirectory, { recursive: true })
  for (const asset of assets) {
    await writeFile(
      join(assetDirectory, `${asset.id}.svg`),
      svgSourceForOpenscad(asset.source),
      'utf8'
    )
  }
}

export async function createProjectFiles(
  directory: string,
  stem: string,
  contents: string,
  files: ScadFile[],
  assets: ScadAsset[]
): Promise<string> {
  const existing = await stat(directory).catch(() => null)
  if (existing && !existing.isDirectory()) throw new Error('Escolha um nome de pasta.')
  const paths = projectPaths(directory, stem)
  await mkdir(paths.codeDirectory, { recursive: true })
  await mkdir(paths.outputDirectory, { recursive: true })
  await writeFile(paths.jsonPath, contents, 'utf8')
  await writeScadFiles(paths.codeDirectory, paths.stem, files)
  await writeAssets(paths.codeDirectory, assets)
  return paths.jsonPath
}

export async function updateProjectFiles(
  jsonPath: string,
  contents: string,
  files: ScadFile[],
  assets: ScadAsset[]
): Promise<void> {
  const paths = projectPaths(dirname(jsonPath), stemFromJsonPath(jsonPath))
  await mkdir(paths.codeDirectory, { recursive: true })
  await mkdir(paths.outputDirectory, { recursive: true })
  await writeFile(jsonPath, contents, 'utf8')
  await writeScadFiles(paths.codeDirectory, paths.stem, files)
  await writeAssets(paths.codeDirectory, assets)
}

export async function writeProjectScad(
  jsonPath: string,
  files: ScadFile[],
  assets: ScadAsset[]
): Promise<string> {
  const paths = projectPaths(dirname(jsonPath), stemFromJsonPath(jsonPath))
  await mkdir(paths.codeDirectory, { recursive: true })
  await writeScadFiles(paths.codeDirectory, paths.stem, files)
  await writeAssets(paths.codeDirectory, assets)
  return paths.scadPath
}

async function writeScadFiles(
  codeDirectory: string,
  stem: string,
  files: ScadFile[]
): Promise<void> {
  const componentsDirectory = join(codeDirectory, 'components')
  await mkdir(componentsDirectory, { recursive: true })
  const expected = new Set<string>()
  for (const file of files) {
    if (!isProjectScadPath(file.path)) continue
    expected.add(file.path)
    const target = join(codeDirectory, file.path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, file.source, 'utf8')
  }
  const existing = await readdir(componentsDirectory).catch(() => [] as string[])
  for (const name of existing) {
    if (!name.endsWith('.scad')) continue
    if (expected.has(`components/${name}`)) continue
    await rm(join(componentsDirectory, name), { force: true })
  }
  if (stem !== 'main') await rm(join(codeDirectory, `${stem}.scad`), { force: true })
}

export interface ProjectModelFile {
  name: string
  data: Uint8Array
}

export interface WrittenProjectModel {
  filePath: string
  missingMaterial: boolean
}

export async function writeProjectStl(jsonPath: string, stl: Uint8Array): Promise<string> {
  const written = await writeProjectModel(jsonPath, 'stl', [{ name: 'model.stl', data: stl }])
  return written.filePath
}

export async function writeProjectModel(
  jsonPath: string,
  format: MeshFormat,
  files: ProjectModelFile[]
): Promise<WrittenProjectModel> {
  const paths = projectPaths(dirname(jsonPath), stemFromJsonPath(jsonPath))
  await mkdir(paths.outputDirectory, { recursive: true })
  if (format === 'stl') {
    await writeFile(paths.stlPath, modelBytes(files, '.stl', 'STL'))
    return { filePath: paths.stlPath, missingMaterial: false }
  }
  if (format === '3mf') {
    await writeFile(paths.threeMfPath, modelBytes(files, '.3mf', '3MF'))
    return { filePath: paths.threeMfPath, missingMaterial: false }
  }
  const obj = modelBytes(files, '.obj', 'OBJ')
  const materialName = basename(paths.mtlPath)
  const rewritten = objWithProjectMaterial(Buffer.from(obj).toString('utf8'), materialName)
  await writeFile(paths.objPath, rewritten, 'utf8')
  const mtl = files.find((file) => file.name.toLowerCase().endsWith('.mtl'))
  if (mtl) await writeFile(paths.mtlPath, mtl.data)
  return { filePath: paths.objPath, missingMaterial: !mtl }
}

function modelBytes(files: ProjectModelFile[], extension: string, label: string): Uint8Array {
  const found = files.find((file) => file.name.toLowerCase().endsWith(extension))
  if (!found) throw new Error(`O OpenSCAD não gerou o ${label}.`)
  return found.data
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
