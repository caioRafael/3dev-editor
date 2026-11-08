import { describe, expect, it } from 'vitest'
import { isMenuCommand, isWindowTitle } from './api'
import { formatWindowTitle } from './windowTitle'

describe('window title', () => {
  it('uses the app name when there is no file', () => {
    expect(formatWindowTitle(null, false)).toBe('3dev editor')
    expect(formatWindowTitle(null, true)).toBe('3dev editor')
  })

  it('uses the project folder or the file name', () => {
    expect(formatWindowTitle('/projetos/Lamp.3dev/Lamp.3dev.json', true)).toBe(
      'Lamp.3dev — 3dev editor'
    )
    expect(formatWindowTitle('C:\\projetos\\Lamp.3dev\\Lamp.3dev.json', true)).toBe(
      'Lamp.3dev — 3dev editor'
    )
    expect(formatWindowTitle('/projetos/Lamp.3dev/Lamp.3dev.json', false)).toBe(
      'Lamp.3dev.json — 3dev editor'
    )
    expect(formatWindowTitle('Lamp.3dev.json', true)).toBe('Sem arquivo — 3dev editor')
  })

  it('keeps the title short enough for the native window', () => {
    const title = formatWindowTitle(`/pasta/${'a'.repeat(200)}/modelo.3dev.json`, true)
    expect(isWindowTitle(title)).toBe(true)
    expect(title.endsWith('— 3dev editor')).toBe(true)
  })
})

describe('menu command', () => {
  it('accepts the commands the native menu sends', () => {
    expect(isMenuCommand({ kind: 'save' })).toBe(true)
    expect(isMenuCommand({ kind: 'export-model', format: '3mf' })).toBe(true)
    expect(isMenuCommand({ kind: 'open-recent', jsonPath: '/projetos/Lamp.3dev.json' })).toBe(true)
  })

  it('rejects a malformed command', () => {
    expect(isMenuCommand(null)).toBe(false)
    expect(isMenuCommand({ kind: 'export-model', format: 'ply' })).toBe(false)
    expect(isMenuCommand({ kind: 'open-recent', jsonPath: '' })).toBe(false)
    expect(isMenuCommand({ kind: 'quit' })).toBe(false)
    expect(isWindowTitle('  3dev editor')).toBe(false)
    expect(isWindowTitle('3dev editor')).toBe(true)
  })
})
