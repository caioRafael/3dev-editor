import { basename, dirname, join } from 'node:path'
import type { RecentProject } from './api'

export const CODE_DIRECTORY = 'code'
export const OUTPUT_DIRECTORY = 'output'
export const RECENT_PROJECT_LIMIT = 8

export interface ProjectPaths {
  directory: string
  stem: string
  jsonPath: string
  codeDirectory: string
  scadPath: string
  outputDirectory: string
  stlPath: string
}

export interface ProjectLocation {
  directory: string
  stem: string
}

export interface ProjectLayoutFlags {
  json: boolean
  code: boolean
  output: boolean
}

export function projectStem(name: string): string {
  const withoutExtension = name
    .replace(/\.3dev\.json$/i, '')
    .replace(/\.json$/i, '')
    .replace(/\.3dev$/i, '')
  const cleaned = stripUnsafe(withoutExtension)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .trim()
  if (!cleaned) return 'modelo'
  return cleaned.slice(0, 80)
}

export function projectPaths(directory: string, stem: string): ProjectPaths {
  const safeStem = projectStem(stem)
  return {
    directory,
    stem: safeStem,
    jsonPath: join(directory, `${safeStem}.3dev.json`),
    codeDirectory: join(directory, CODE_DIRECTORY),
    scadPath: join(directory, CODE_DIRECTORY, `${safeStem}.scad`),
    outputDirectory: join(directory, OUTPUT_DIRECTORY),
    stlPath: join(directory, OUTPUT_DIRECTORY, `${safeStem}.stl`)
  }
}

export function stemFromJsonPath(jsonPath: string): string {
  return projectStem(basename(jsonPath))
}

export function projectFolderName(jsonPath: string): string {
  const folder = basename(dirname(jsonPath))
  return folder || 'modelo'
}

export function projectLocationFromPick(picked: string): ProjectLocation {
  const base = basename(picked)
  const stem = projectStem(base)
  const directory = /\.json$/i.test(base) ? join(dirname(picked), stem) : picked
  return { directory, stem }
}

export function isProjectLayout(flags: ProjectLayoutFlags): boolean {
  return flags.json && flags.code && flags.output
}

export function rememberRecent(
  projects: RecentProject[],
  next: RecentProject,
  limit = RECENT_PROJECT_LIMIT
): RecentProject[] {
  const rest = projects.filter((project) => project.jsonPath !== next.jsonPath)
  return [next, ...rest].slice(0, limit)
}

export function parseRecentProjects(value: unknown): RecentProject[] {
  if (!Array.isArray(value)) return []
  const projects: RecentProject[] = []
  for (const item of value) {
    if (!isRecentProject(item)) continue
    projects.push({ name: item.name, jsonPath: item.jsonPath })
  }
  return projects.slice(0, RECENT_PROJECT_LIMIT)
}

export function compareNamedEntries(
  left: { name: string; kind: 'file' | 'directory' },
  right: { name: string; kind: 'file' | 'directory' }
): number {
  if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
  return left.name.localeCompare(right.name)
}

function stripUnsafe(value: string): string {
  let result = ''
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < 32 || '<>:"/\\|?*'.includes(character)) result += ' '
    else result += character
  }
  return result
}

function isRecentProject(value: unknown): value is RecentProject {
  if (typeof value !== 'object' || value === null) return false
  if (!('name' in value) || !('jsonPath' in value)) return false
  if (typeof value.name !== 'string' || typeof value.jsonPath !== 'string') return false
  return value.name.trim().length > 0 && value.jsonPath.endsWith('.json')
}
