import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { constants, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { OpenscadStatus, PreviewStlResult, ScadAsset } from '../shared/api'

const execFileAsync = promisify(execFile)
const previewCache = new Map<string, Uint8Array>()
let cachedCommand: string | null = null

export function bosl2Directory(): string {
  const candidates = is.dev
    ? [join(process.cwd(), 'resources', 'BOSL2'), join(app.getAppPath(), 'resources', 'BOSL2')]
    : [join(process.resourcesPath, 'BOSL2'), join(process.cwd(), 'resources', 'BOSL2')]
  return candidates.find((candidate) => existsSync(join(candidate, 'std.scad'))) ?? candidates[0]
}

export function openscadLibraryPath(): string {
  return dirname(bosl2Directory())
}

export async function detectOpenscad(): Promise<OpenscadStatus> {
  const library = join(bosl2Directory(), 'std.scad')
  try {
    await access(library, constants.R_OK)
  } catch {
    return { available: false, command: null, message: 'Biblioteca BOSL2 não encontrada.' }
  }

  const candidates = [
    process.env.OPENSCAD_BIN,
    '/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD',
    '/opt/homebrew/bin/openscad',
    '/usr/local/bin/openscad',
    '/usr/bin/openscad'
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      cachedCommand = candidate
      return { available: true, command: candidate, message: candidate }
    }
  }

  try {
    const { stdout } = await execFileAsync('which', ['openscad'])
    const found = stdout.trim()
    if (found && (await isExecutable(found))) {
      cachedCommand = found
      return { available: true, command: found, message: found }
    }
  } catch {
    cachedCommand = null
  }

  return {
    available: false,
    command: null,
    message: 'OpenSCAD não encontrado. A prévia rápida continua disponível.'
  }
}

export async function renderStl(
  source: string,
  assets: ScadAsset[] = []
): Promise<PreviewStlResult> {
  const status = cachedCommand
    ? { available: true, command: cachedCommand, message: cachedCommand }
    : await detectOpenscad()
  if (!status.available || !status.command) return { ok: false, message: status.message }

  const hash = hashSource(source, assets)
  const cached = previewCache.get(hash)
  if (cached) return { ok: true, message: '', stl: cached }

  const directory = await mkdtemp(join(tmpdir(), '3dev-'))
  const scadPath = join(directory, 'model.scad')
  const stlPath = join(directory, 'model.stl')
  try {
    await writeFile(scadPath, source, 'utf8')
    await writeAssets(directory, assets)
    await execFileAsync(status.command, ['-o', stlPath, scadPath], {
      env: { ...process.env, OPENSCADPATH: openscadLibraryPath() },
      timeout: 120000,
      maxBuffer: 12 * 1024 * 1024
    })
    const stl = new Uint8Array(await readFile(stlPath))
    previewCache.set(hash, stl)
    if (previewCache.size > 8) {
      const oldest = previewCache.keys().next().value
      if (oldest) previewCache.delete(oldest)
    }
    return { ok: true, message: '', stl }
  } catch (error) {
    cachedCommand = null
    return { ok: false, message: errorText(error) }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function writeAssets(directory: string, assets: ScadAsset[]): Promise<void> {
  if (assets.length === 0) return
  const assetDirectory = join(directory, '3dev-assets')
  await mkdir(assetDirectory, { recursive: true })
  for (const asset of assets) {
    await writeFile(join(assetDirectory, `${asset.id}.svg`), asset.source, 'utf8')
  }
}

function hashSource(source: string, assets: ScadAsset[]): string {
  const hash = createHash('sha256')
  hash.update(source)
  for (const asset of [...assets].sort((left, right) => left.id.localeCompare(right.id))) {
    hash.update(asset.id)
    hash.update(asset.source)
  }
  return hash.digest('hex')
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function errorText(error: unknown): string {
  if (typeof error === 'object' && error && 'stderr' in error) {
    const stderr = error.stderr
    const text =
      typeof stderr === 'string' ? stderr : stderr instanceof Buffer ? stderr.toString() : ''
    if (text.trim()) return text.trim()
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return 'Falha ao executar o OpenSCAD.'
}
