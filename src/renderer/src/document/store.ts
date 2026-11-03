import { create } from 'zustand'
import {
  type EditorTool,
  type FeaturePatch,
  type PreviewMode,
  type ProjectDocument,
  type Transform,
  type Vec3
} from './types'
import {
  bakeScale,
  createBoolean,
  createEmptyDocument,
  createPrimitive,
  createProfile,
  createSvgProfile,
  deleteNodes,
  patchNode,
  setNodeTransform,
  type BooleanResult
} from './tree'
import type { BooleanKind, PrimitiveKind, ShapeProfileKind } from './types'

const HISTORY_LIMIT = 50

interface EditorState {
  document: ProjectDocument
  selection: string[]
  tool: EditorTool
  previewMode: PreviewMode
  previewNonce: number
  filePath: string | null
  isProject: boolean
  filesNonce: number
  status: string
  previewPending: number
  previewLabel: string | null
  past: ProjectDocument[]
  future: ProjectDocument[]
  historyPending: boolean
  setTool: (tool: EditorTool) => void
  setStatus: (status: string) => void
  beginPreview: (label: string) => void
  endPreview: () => void
  setProject: (filePath: string | null, isProject: boolean) => void
  touchFiles: () => void
  setPreviewMode: (previewMode: PreviewMode) => void
  requestExactPreview: () => void
  select: (id: string | null, options?: { additive?: boolean }) => void
  toggleVisible: (id: string) => void
  newDocument: () => void
  loadDocument: (document: ProjectDocument, filePath: string | null, isProject: boolean) => void
  undo: () => void
  redo: () => void
  addPrimitive: (kind: PrimitiveKind) => void
  addProfile: (kind: ShapeProfileKind) => void
  addSvg: (fileName: string, source: string) => void
  applyBoolean: (kind: BooleanKind) => void
  removeSelected: () => void
  updateNode: (id: string, patch: FeaturePatch, recordHistory?: boolean) => void
  markHistory: () => void
  sealHistory: () => void
  commitTransform: (id: string, transform: Transform, scale: Vec3 | null) => void
  setFn: (fn: number) => void
  applyCode: (document: ProjectDocument) => void
}

export const useEditor = create<EditorState>((set) => ({
  document: createEmptyDocument(),
  selection: [],
  tool: 'select',
  previewMode: 'fast',
  previewNonce: 0,
  filePath: null,
  isProject: false,
  filesNonce: 0,
  status: 'Pronto',
  previewPending: 0,
  previewLabel: null,
  past: [],
  future: [],
  historyPending: false,

  setTool: (tool) => set({ tool }),
  setStatus: (status) => set({ status }),
  beginPreview: (previewLabel) =>
    set((state) => ({ previewPending: state.previewPending + 1, previewLabel })),
  endPreview: () =>
    set((state) => {
      const previewPending = Math.max(0, state.previewPending - 1)
      return { previewPending, previewLabel: previewPending === 0 ? null : state.previewLabel }
    }),
  setProject: (filePath, isProject) =>
    set((state) => ({ filePath, isProject, filesNonce: state.filesNonce + 1 })),
  touchFiles: () => set((state) => ({ filesNonce: state.filesNonce + 1 })),
  setPreviewMode: (previewMode) => set({ previewMode }),
  requestExactPreview: () =>
    set((state) => ({ previewMode: 'openscad', previewNonce: state.previewNonce + 1 })),

  select: (id, options) =>
    set((state) => {
      if (!id) return { selection: [] }
      if (options?.additive) {
        const exists = state.selection.includes(id)
        return {
          selection: exists
            ? state.selection.filter((item) => item !== id)
            : [...state.selection, id]
        }
      }
      return { selection: [id] }
    }),

  toggleVisible: (id) =>
    set((state) => {
      const node = state.document.nodes[id]
      if (!node) return state
      return commit(state, patchNode(state.document, id, { visible: !node.visible }))
    }),

  newDocument: () =>
    set((state) => ({
      document: createEmptyDocument(),
      selection: [],
      past: [],
      future: [],
      filePath: null,
      isProject: false,
      filesNonce: state.filesNonce + 1,
      previewMode: 'fast',
      status: 'Novo modelo',
      historyPending: false,
      previewPending: 0,
      previewLabel: null
    })),

  loadDocument: (document, filePath, isProject) =>
    set((state) => ({
      document,
      filePath,
      isProject,
      filesNonce: state.filesNonce + 1,
      selection: [],
      past: [],
      future: [],
      historyPending: false,
      previewPending: 0,
      previewLabel: null,
      status: 'Modelo aberto'
    })),

  undo: () =>
    set((state) => {
      const previous = state.past.at(-1)
      if (!previous) return state
      return {
        document: previous,
        past: state.past.slice(0, -1),
        future: [state.document, ...state.future].slice(0, HISTORY_LIMIT),
        historyPending: false,
        selection: state.selection.filter((id) => previous.nodes[id])
      }
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0]
      if (!next) return state
      return {
        document: next,
        future: state.future.slice(1),
        past: [...state.past, state.document].slice(-HISTORY_LIMIT),
        historyPending: false,
        selection: state.selection.filter((id) => next.nodes[id])
      }
    }),

  addPrimitive: (kind) =>
    set((state) => {
      const created = createPrimitive(state.document, kind)
      return {
        ...commit(state, created.document),
        selection: [created.id],
        status: `${created.name} criado`
      }
    }),

  addProfile: (kind) =>
    set((state) => {
      const created = createProfile(state.document, kind)
      return {
        ...commit(state, created.document),
        selection: [created.id],
        status: `${created.name} criado`
      }
    }),

  addSvg: (fileName, source) =>
    set((state) => {
      const created = createSvgProfile(state.document, fileName, source)
      if (!created.id) return { status: created.error ?? 'Não foi possível importar o SVG.' }
      return {
        ...commit(state, created.document),
        selection: [created.id],
        status: `${created.name ?? 'SVG'} importado`
      }
    }),

  applyBoolean: (kind) =>
    set((state) => {
      const result: BooleanResult = createBoolean(state.document, kind, state.selection)
      if (!result.id) return { status: result.error ?? 'Não foi possível criar a operação.' }
      return {
        ...commit(state, result.document),
        selection: [result.id],
        status: 'Operação booleana criada'
      }
    }),

  removeSelected: () =>
    set((state) => {
      if (state.selection.length === 0) return state
      if (state.selection.some((id) => state.document.nodes[id]?.locked)) {
        return { status: 'Há sólidos travados na seleção.' }
      }
      return {
        ...commit(state, deleteNodes(state.document, state.selection)),
        selection: [],
        status: 'Seleção removida'
      }
    }),

  updateNode: (id, patch, recordHistory = true) =>
    set((state) => {
      const node = state.document.nodes[id]
      if (!node) return state
      const keys = Object.keys(patch)
      const metadataOnly = keys.every((key) => key === 'locked' || key === 'visible')
      if (node.locked && !metadataOnly) return { status: 'Sólido travado.' }
      const next = patchNode(state.document, id, patch)
      if (!recordHistory) {
        if (JSON.stringify(state.document) === JSON.stringify(next)) return {}
        return { document: next }
      }
      return commit(state, next)
    }),

  markHistory: () =>
    set((state) => {
      if (state.historyPending) return state
      const past = [...state.past, state.document]
      if (past.length > HISTORY_LIMIT) past.shift()
      return { historyPending: true, past, future: [] }
    }),

  sealHistory: () =>
    set((state) => {
      if (!state.historyPending) return state
      const previous = state.past.at(-1)
      if (previous && JSON.stringify(previous) === JSON.stringify(state.document)) {
        return { historyPending: false, past: state.past.slice(0, -1) }
      }
      return { historyPending: false }
    }),

  commitTransform: (id, transform, scale) =>
    set((state) => {
      const node = state.document.nodes[id]
      if (!node || node.locked) return node?.locked ? { status: 'Sólido travado.' } : state
      const moved = setNodeTransform(state.document, id, transform)
      const next = scale ? bakeScale(moved, id, scale) : moved
      return commit(state, next)
    }),

  setFn: (fn) =>
    set((state) => {
      const nextFn = Math.round(Math.min(256, Math.max(8, fn)))
      if (!Number.isFinite(nextFn)) return state
      return commit(state, { ...state.document, fn: nextFn })
    }),

  applyCode: (document) =>
    set((state) => {
      const next = commit(state, document)
      if (!next.document) return {}
      return {
        ...next,
        selection: state.selection.filter((id) => document.nodes[id])
      }
    })
}))

function commit(state: EditorState, document: ProjectDocument): Partial<EditorState> {
  if (JSON.stringify(state.document) === JSON.stringify(document)) return {}
  const past = [...state.past, state.document]
  if (past.length > HISTORY_LIMIT) past.shift()
  return { document, past, future: [] }
}
