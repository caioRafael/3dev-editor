export type HistoryAction = 'undo' | 'redo'

interface EditorHistory {
  undo: () => void
  redo: () => void
}

type HistoryTarget = 'editor' | 'field' | 'document'

let editorHistory: EditorHistory | null = null
let target: HistoryTarget = 'document'
let field: HTMLInputElement | HTMLTextAreaElement | null = null

export function registerEditorHistory(history: EditorHistory): () => void {
  editorHistory = history
  return () => {
    if (editorHistory === history) editorHistory = null
  }
}

export function applyLocalHistory(action: HistoryAction): boolean {
  if (target === 'editor' && editorHistory) {
    editorHistory[action]()
    return true
  }
  if (target === 'field' && field?.isConnected && !field.readOnly && !field.disabled) {
    field.focus()
    document.execCommand(action)
    return true
  }
  return false
}

if (typeof window !== 'undefined') {
  window.addEventListener('focusin', (event) => {
    const next = event.target
    if (!(next instanceof Element)) return
    if (next.closest('.monaco-editor')) {
      target = 'editor'
      field = null
      return
    }
    if (
      (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) &&
      !next.readOnly &&
      !next.disabled
    ) {
      target = 'field'
      field = next
      return
    }
    if (next !== document.body && next !== document.documentElement) {
      target = 'document'
      field = null
    }
  })

  window.addEventListener(
    'pointerdown',
    (event) => {
      const next = event.target
      if (!(next instanceof Element)) return
      if (next.closest('.monaco-editor, input, textarea')) return
      target = 'document'
      field = null
    },
    true
  )
}
