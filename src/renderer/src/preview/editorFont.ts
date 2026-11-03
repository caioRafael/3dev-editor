import { parse } from 'opentype.js'
import fontUrl from '../assets/fonts/LiberationSans-Regular.ttf?url'

export interface GlyphCommand {
  type: string
  x?: number
  y?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
}

export interface GlyphPath {
  commands: GlyphCommand[]
}

export interface EditorFont {
  getPath: (text: string, x: number, y: number, fontSize: number) => GlyphPath
}

let fontPromise: Promise<EditorFont> | null = null

export function loadEditorFont(): Promise<EditorFont> {
  if (!fontPromise) {
    fontPromise = fetch(fontUrl)
      .then((response) => {
        if (!response.ok) throw new Error('Não foi possível carregar a fonte.')
        return response.arrayBuffer()
      })
      .then((buffer) => {
        const font: unknown = parse(buffer)
        if (!isEditorFont(font)) throw new Error('Fonte inválida.')
        return font
      })
      .catch((error: unknown) => {
        fontPromise = null
        throw error
      })
  }
  return fontPromise
}

function isEditorFont(value: unknown): value is EditorFont {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getPath' in value &&
    isPathFunction(value.getPath)
  )
}

function isPathFunction(value: unknown): value is EditorFont['getPath'] {
  return typeof value === 'function'
}
