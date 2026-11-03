import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  compareNamedEntries,
  isProjectLayout,
  parseRecentProjects,
  projectFolderName,
  projectLocationFromPick,
  projectPaths,
  projectStem,
  rememberRecent,
  stemFromJsonPath
} from './project'

describe('project layout', () => {
  it('keeps a readable stem and falls back when the name is empty', () => {
    expect(projectStem('Sem título')).toBe('Sem título')
    expect(projectStem('  ')).toBe('modelo')
    expect(projectStem('../segredo')).toBe('segredo')
    expect(projectStem('Lamp.3dev.json')).toBe('Lamp')
    expect(projectStem('a<b>:c.3dev')).toBe('a b c')
  })

  it('places the document at the root, the source in code and the mesh in output', () => {
    const paths = projectPaths('/projetos/Lamp.3dev', 'Lamp')
    expect(paths.jsonPath).toBe(join('/projetos/Lamp.3dev', 'Lamp.3dev.json'))
    expect(paths.scadPath).toBe(join('/projetos/Lamp.3dev', 'code', 'Lamp.scad'))
    expect(paths.stlPath).toBe(join('/projetos/Lamp.3dev', 'output', 'Lamp.stl'))
    expect(paths.codeDirectory).toBe(join('/projetos/Lamp.3dev', 'code'))
    expect(paths.outputDirectory).toBe(join('/projetos/Lamp.3dev', 'output'))
  })

  it('uses the chosen folder and derives the stem from its name', () => {
    expect(projectLocationFromPick('/docs/Sem título.3dev')).toEqual({
      directory: '/docs/Sem título.3dev',
      stem: 'Sem título'
    })
    expect(projectLocationFromPick('/docs/Lamp.3dev.json')).toEqual({
      directory: join('/docs', 'Lamp'),
      stem: 'Lamp'
    })
  })

  it('reads the stem and the folder from a project json path', () => {
    const jsonPath = join('/docs/Lamp.3dev', 'Lamp.3dev.json')
    expect(stemFromJsonPath(jsonPath)).toBe('Lamp')
    expect(projectFolderName(jsonPath)).toBe('Lamp.3dev')
  })

  it('treats a folder as a project only when the json and both directories exist', () => {
    expect(isProjectLayout({ json: true, code: true, output: true })).toBe(true)
    expect(isProjectLayout({ json: true, code: true, output: false })).toBe(false)
  })

  it('moves a reopened project to the top and drops the oldest', () => {
    const first = { name: 'Um', jsonPath: '/a/um.3dev.json' }
    const second = { name: 'Dois', jsonPath: '/b/dois.3dev.json' }
    const third = { name: 'Três', jsonPath: '/c/tres.3dev.json' }
    const remembered = rememberRecent(rememberRecent([first], second, 2), first, 2)
    expect(remembered).toEqual([first, second])
    expect(rememberRecent([first, second], third, 2)).toEqual([third, first])
  })

  it('ignores recent entries that are not project json files', () => {
    expect(
      parseRecentProjects([
        { name: 'Lamp', jsonPath: '/docs/Lamp.3dev.json' },
        { name: ' ', jsonPath: '/docs/vazio.json' },
        { name: 'Notas', jsonPath: '/docs/notas.txt' },
        'Lamp'
      ])
    ).toEqual([{ name: 'Lamp', jsonPath: '/docs/Lamp.3dev.json' }])
  })

  it('lists directories before files', () => {
    const entries = [
      { name: 'b.scad', kind: 'file' as const },
      { name: '3dev-assets', kind: 'directory' as const },
      { name: 'a.scad', kind: 'file' as const }
    ]
    expect([...entries].sort(compareNamedEntries).map((entry) => entry.name)).toEqual([
      '3dev-assets',
      'a.scad',
      'b.scad'
    ])
  })
})
