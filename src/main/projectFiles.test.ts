import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProjectEntry } from '../shared/api'
import {
  createProjectFiles,
  readProjectTree,
  updateProjectFiles,
  writeProjectStl
} from './projectFiles'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('project files', () => {
  it('creates the json, the scad and an empty output folder', async () => {
    const parent = await makeTemp()
    const directory = join(parent, 'Lamp.3dev')
    const jsonPath = await createProjectFiles(
      directory,
      'Lamp',
      '{"name":"Lamp"}',
      [scad('cube();')],
      []
    )
    expect(jsonPath).toBe(join(directory, 'Lamp.3dev.json'))
    expect(await readFile(join(directory, 'code', 'main.scad'), 'utf8')).toBe('cube();')
    const tree = await readProjectTree(jsonPath)
    expect(tree?.isProject).toBe(true)
    expect(tree?.rootName).toBe('Lamp.3dev')
    expect(tree?.output).toEqual([])
  })

  it('keeps exported meshes when the source is saved again', async () => {
    const parent = await makeTemp()
    const jsonPath = await createProjectFiles(
      join(parent, 'Lamp.3dev'),
      'Lamp',
      '{}',
      [scad('cube();')],
      []
    )
    const stlPath = await writeProjectStl(jsonPath, new Uint8Array([1, 2, 3]))
    await updateProjectFiles(jsonPath, '{"version":1}', [scad('sphere();')], [])
    expect(await readFile(join(parent, 'Lamp.3dev', 'code', 'main.scad'), 'utf8')).toBe('sphere();')
    expect([...(await readFile(stlPath))]).toEqual([1, 2, 3])
  })

  it('lists code and output without files that sit beside them', async () => {
    const parent = await makeTemp()
    const directory = join(parent, 'Lamp.3dev')
    const jsonPath = await createProjectFiles(directory, 'Lamp', '{}', [scad('cube();')], [])
    await mkdir(join(directory, 'code', '3dev-assets'), { recursive: true })
    await writeFile(join(directory, 'code', 'b.scad'), 'b')
    await writeFile(join(directory, 'notes.txt'), 'no')
    const outside = await makeTemp()
    await writeFile(join(outside, 'secret.txt'), 'no')
    await symlink(outside, join(directory, 'code', 'linked'))
    const tree = await readProjectTree(jsonPath)
    expect(tree?.code[0]?.name).toBe('3dev-assets')
    expect(tree?.code.map((entry) => entry.name).sort()).toEqual(
      ['3dev-assets', 'components', 'main.scad', 'b.scad', 'linked'].sort()
    )
    expect(tree?.code.find((entry) => entry.name === 'linked')).toEqual({
      name: 'linked',
      kind: 'file',
      children: []
    })
    expect(JSON.stringify(tree)).not.toContain('secret.txt')
    expect(JSON.stringify(tree)).not.toContain('notes.txt')
  })

  it('stops descending after six directory levels', async () => {
    const parent = await makeTemp()
    const directory = join(parent, 'Lamp.3dev')
    const jsonPath = await createProjectFiles(directory, 'Lamp', '{}', [scad('cube();')], [])
    let nested = join(directory, 'code')
    for (let level = 0; level < 6; level += 1) {
      nested = join(nested, `d${level}`)
      await mkdir(nested)
    }
    await writeFile(join(nested, 'secret.txt'), 'no')
    const tree = await readProjectTree(jsonPath)
    const deepest = descend(tree?.code ?? [], ['d0', 'd1', 'd2', 'd3', 'd4', 'd5'])
    expect(deepest?.children).toEqual([])
  })

  it('returns null when the json is missing', async () => {
    const parent = await makeTemp()
    expect(await readProjectTree(join(parent, 'missing.3dev.json'))).toBeNull()
  })
})

function scad(source: string): { path: string; source: string } {
  return { path: 'main.scad', source }
}

async function makeTemp(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), '3dev-project-'))
  roots.push(root)
  return root
}

function descend(entries: ProjectEntry[], names: string[]): ProjectEntry | null {
  let current: ProjectEntry | null = null
  let level = entries
  for (const name of names) {
    current = level.find((entry) => entry.name === name) ?? null
    if (!current) return null
    level = current.children
  }
  return current
}
