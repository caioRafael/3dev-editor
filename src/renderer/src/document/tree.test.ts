import { describe, expect, it } from 'vitest'
import { activeModel, MAIN_FILE, replaceActive } from './files'
import { parseProjectDocument } from './parse'
import {
  createBoolean,
  createComponentFile,
  createComponentInstance,
  createEmptyDocument,
  createPrimitive,
  createProfile,
  createSvgProfile,
  bakeScale,
  deleteNodes,
  patchNode
} from './tree'
import { useEditor } from './store'

describe('document tree', () => {
  it('centers a boolean on the selected solids and keeps them editable', () => {
    const first = createPrimitive(createEmptyDocument(), 'cuboid')
    const second = createPrimitive(first.document, 'cuboid')
    const current = activeModel(second.document)
    const moved = replaceActive(second.document, {
      nodes: {
        ...current.nodes,
        [second.id]: {
          ...current.nodes[second.id],
          transform: {
            position: { x: 30, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 }
          }
        }
      },
      assets: current.assets
    })
    const result = createBoolean(moved, 'difference', [first.id, second.id])
    expect(result.id).not.toBeNull()
    const booleanNode = activeModel(result.document).nodes[result.id ?? '']
    expect(booleanNode.kind).toBe('difference')
    if (booleanNode.kind !== 'difference') return
    expect(booleanNode.childIds).toEqual([first.id, second.id])
    expect(activeModel(result.document).nodes[first.id].consumedBy).toBe(result.id)
    expect(activeModel(result.document).nodes[first.id].transform.position.x).toBe(-15)
    expect(activeModel(result.document).nodes[second.id].transform.position.x).toBe(15)
  })

  it('clamps edge rounding to the cuboid size', () => {
    const created = createPrimitive(createEmptyDocument(), 'cuboid')
    const next = patchNode(created.document, created.id, { rounding: 50 })
    const node = activeModel(next).nodes[created.id]
    expect(node?.kind).toBe('cuboid')
    if (node?.kind !== 'cuboid') return
    expect(node.rounding).toBe(9.999)
    expect(node.chamfer).toBe(0)
  })

  it('clamps edge rounding of a boolean to the result size', () => {
    const first = createPrimitive(createEmptyDocument(), 'cuboid')
    const second = createPrimitive(first.document, 'cuboid')
    const result = createBoolean(second.document, 'union', [first.id, second.id])
    if (!result.id) throw new Error('expected boolean')
    const next = patchNode(result.document, result.id, { rounding: 50 })
    const node = activeModel(next).nodes[result.id]
    expect(node?.kind).toBe('union')
    if (node?.kind !== 'union') return
    expect(node.rounding).toBe(9.999)
  })

  it('opens a version 1 project that has no asset library', () => {
    const created = createPrimitive(createEmptyDocument(), 'cuboid')
    const legacy = {
      version: 1,
      name: 'legacy',
      units: 'mm',
      fn: 48,
      nodes: activeModel(created.document).nodes
    }
    const parsed = parseProjectDocument(legacy)
    expect(parsed?.version).toBe(2)
    expect(parsed?.activeFile).toBe(MAIN_FILE)
    expect(parsed ? activeModel(parsed).assets : null).toEqual({})
    expect(parsed ? activeModel(parsed).nodes[created.id]?.kind : null).toBe('cuboid')
  })

  it('drops an svg asset when its profile is deleted', () => {
    const created = createSvgProfile(
      createEmptyDocument(),
      'mark.svg',
      '<svg viewBox="0 0 10 10"></svg>'
    )
    expect(created.id).not.toBeNull()
    const next = deleteNodes(created.document, [created.id ?? ''])
    expect(activeModel(next).nodes[created.id ?? '']).toBeUndefined()
    expect(activeModel(next).assets).toEqual({})
  })

  it('uses a renamed text profile as the extruded string', () => {
    const created = createProfile(createEmptyDocument(), 'text')
    const next = patchNode(created.document, created.id, { name: 'Casa' })
    const profile = activeModel(next).nodes[created.id]
    if (profile?.kind !== 'text') throw new Error('expected text')
    expect(profile.name).toBe('Casa')
    expect(profile.text).toBe('Casa')
  })

  it('bakes a rectangle scale into its profile size and height', () => {
    const created = createProfile(createEmptyDocument(), 'rect')
    const next = bakeScale(created.document, created.id, { x: 2, y: 1, z: 3 })
    const profile = activeModel(next).nodes[created.id]
    if (profile?.kind !== 'rect') throw new Error('expected rect')
    expect(profile.size).toEqual({ x: 40, y: 12 })
    expect(profile.extrusion.height).toBe(12)
  })

  it('unwraps a boolean that no longer has two children', () => {
    const first = createPrimitive(createEmptyDocument(), 'sphere')
    const second = createPrimitive(first.document, 'sphere')
    const result = createBoolean(second.document, 'union', [first.id, second.id])
    const booleanId = result.id
    if (!booleanId) throw new Error('expected boolean')
    const next = deleteNodes(result.document, [second.id])
    expect(activeModel(next).nodes[booleanId]).toBeUndefined()
    expect(activeModel(next).nodes[first.id].consumedBy).toBeNull()
    expect(activeModel(next).nodes[second.id]).toBeUndefined()
  })
})

describe('editor store', () => {
  it('undoes and redoes primitive creation', () => {
    useEditor.getState().newDocument()
    useEditor.getState().addPrimitive('cuboid')
    expect(Object.keys(activeModel(useEditor.getState().document).nodes)).toHaveLength(1)
    useEditor.getState().undo()
    expect(Object.keys(activeModel(useEditor.getState().document).nodes)).toHaveLength(0)
    useEditor.getState().redo()
    expect(Object.keys(activeModel(useEditor.getState().document).nodes)).toHaveLength(1)
  })
})

describe('components', () => {
  it('rejects a duplicate or reserved component name', () => {
    const created = createComponentFile(createEmptyDocument(), 'Pino')
    expect(created.error).toBeNull()
    expect(createComponentFile(created.document, 'pino').error).toBe(
      'Já existe um componente com esse nome.'
    )
    expect(createComponentFile(created.document, 'main').error).toBe('Esse nome é reservado.')
    expect(createComponentFile(created.document, 'cuboid').error).toBe('Esse nome é reservado.')
  })

  it('refuses a component that would cycle back to the file being edited', () => {
    const pino = createComponentFile(createEmptyDocument(), 'Pino')
    const tampa = createComponentFile(pino.document, 'Tampa')
    const host = { ...tampa.document, activeFile: 'Pino' }
    const nested = createComponentInstance(host, 'Tampa')
    const back = createComponentInstance({ ...nested.document, activeFile: 'Tampa' }, 'Pino')
    expect(back.error).toBe('Esse componente criaria um ciclo.')
    expect(back.id).toBeNull()
  })
})
