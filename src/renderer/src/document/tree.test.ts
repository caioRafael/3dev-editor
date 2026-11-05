import { describe, expect, it } from 'vitest'
import { activeModel, MAIN_FILE, replaceActive } from './files'
import { parseProjectDocument } from './parse'
import {
  createBoolean,
  createComponentFile,
  createComponentInstance,
  createEmptyDocument,
  createOperation,
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

  it('removes a boolean and keeps both solids', () => {
    const first = createPrimitive(createEmptyDocument(), 'cuboid')
    const second = createPrimitive(first.document, 'sphere')
    const result = createBoolean(second.document, 'union', [first.id, second.id])
    const booleanId = result.id
    if (!booleanId) throw new Error('expected boolean')
    const original = activeModel(second.document).nodes[first.id].transform.position
    const next = deleteNodes(result.document, [booleanId])
    const nodes = activeModel(next).nodes
    expect(nodes[booleanId]).toBeUndefined()
    expect(nodes[first.id].consumedBy).toBeNull()
    expect(nodes[second.id].consumedBy).toBeNull()
    expect(nodes[first.id].transform.position).toEqual(original)
  })

  it('turns an operation off without removing its child', () => {
    const profile = createProfile(createEmptyDocument(), 'circle')
    const offset = createOperation(profile.document, 'offset', [profile.id])
    const offsetId = offset.id
    if (!offsetId) throw new Error('expected offset')
    const disabled = patchNode(offset.document, offsetId, { enabled: false })
    const node = activeModel(disabled).nodes[offsetId]
    expect(node?.enabled).toBe(false)
    expect(activeModel(disabled).nodes[profile.id]).toBeDefined()
    const removed = deleteNodes(disabled, [offsetId])
    expect(activeModel(removed).nodes[offsetId]).toBeUndefined()
    expect(activeModel(removed).nodes[profile.id].consumedBy).toBeNull()
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
  it('deactivates the selected operation when the same action is used again', () => {
    useEditor.getState().newDocument()
    useEditor.getState().addProfile('circle')
    const profileId = useEditor.getState().selection[0]
    useEditor.getState().applyOperation('offset')
    const offsetId = useEditor.getState().selection[0]
    expect(offsetId).not.toBe(profileId)
    useEditor.getState().applyOperation('offset')
    expect(activeModel(useEditor.getState().document).nodes[offsetId]?.enabled).toBe(false)
    expect(activeModel(useEditor.getState().document).nodes[profileId]).toBeDefined()
    useEditor.getState().applyOperation('offset')
    expect(activeModel(useEditor.getState().document).nodes[offsetId]?.enabled).toBe(true)
  })

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

describe('operations', () => {
  it('offsets a profile and rejects a solid', () => {
    const profile = createProfile(createEmptyDocument(), 'circle')
    const offset = createOperation(profile.document, 'offset', [profile.id])
    expect(offset.error).toBeNull()
    const node = activeModel(offset.document).nodes[offset.id ?? '']
    expect(node?.kind).toBe('offset')
    if (node?.kind !== 'offset') return
    expect(node.childIds).toEqual([profile.id])
    expect(node.mode).toBe('radius')
    expect(node.distance).toBe(1)
    expect(activeModel(offset.document).nodes[profile.id].consumedBy).toBe(offset.id)

    const solid = createPrimitive(createEmptyDocument(), 'cuboid')
    const rejected = createOperation(solid.document, 'offset', [solid.id])
    expect(rejected.id).toBeNull()
    expect(rejected.error).toContain('perfis')
  })

  it('requires two solids for a 3D hull and one profile for a revolve', () => {
    const first = createPrimitive(createEmptyDocument(), 'cuboid')
    expect(createOperation(first.document, 'hull', [first.id]).error).toContain('dois')
    const profile = createProfile(createEmptyDocument(), 'rect')
    const revolve = createOperation(profile.document, 'revolve', [profile.id])
    expect(revolve.error).toBeNull()
    expect(activeModel(revolve.document).nodes[revolve.id ?? '']?.kind).toBe('revolve')
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
