import { describe, expect, it } from 'vitest'
import { createBoolean, createEmptyDocument, createPrimitive, deleteNodes, patchNode } from './tree'
import { useEditor } from './store'

describe('document tree', () => {
  it('centers a boolean on the selected solids and keeps them editable', () => {
    const first = createPrimitive(createEmptyDocument(), 'cuboid')
    const second = createPrimitive(first.document, 'cuboid')
    const moved = {
      ...second.document,
      nodes: {
        ...second.document.nodes,
        [second.id]: {
          ...second.document.nodes[second.id],
          transform: {
            position: { x: 30, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 }
          }
        }
      }
    }
    const result = createBoolean(moved, 'difference', [first.id, second.id])
    expect(result.id).not.toBeNull()
    const booleanNode = result.document.nodes[result.id ?? '']
    expect(booleanNode.kind).toBe('difference')
    if (booleanNode.kind !== 'difference') return
    expect(booleanNode.childIds).toEqual([first.id, second.id])
    expect(result.document.nodes[first.id].consumedBy).toBe(result.id)
    expect(result.document.nodes[first.id].transform.position.x).toBe(-15)
    expect(result.document.nodes[second.id].transform.position.x).toBe(15)
  })

  it('clamps edge rounding to the cuboid size', () => {
    const created = createPrimitive(createEmptyDocument(), 'cuboid')
    const next = patchNode(created.document, created.id, { rounding: 50 })
    const node = next.nodes[created.id]
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
    const node = next.nodes[result.id]
    expect(node?.kind).toBe('union')
    if (node?.kind !== 'union') return
    expect(node.rounding).toBe(9.999)
  })

  it('unwraps a boolean that no longer has two children', () => {
    const first = createPrimitive(createEmptyDocument(), 'sphere')
    const second = createPrimitive(first.document, 'sphere')
    const result = createBoolean(second.document, 'union', [first.id, second.id])
    const booleanId = result.id
    if (!booleanId) throw new Error('expected boolean')
    const next = deleteNodes(result.document, [second.id])
    expect(next.nodes[booleanId]).toBeUndefined()
    expect(next.nodes[first.id].consumedBy).toBeNull()
    expect(next.nodes[second.id]).toBeUndefined()
  })
})

describe('editor store', () => {
  it('undoes and redoes primitive creation', () => {
    useEditor.getState().newDocument()
    useEditor.getState().addPrimitive('cuboid')
    expect(Object.keys(useEditor.getState().document.nodes)).toHaveLength(1)
    useEditor.getState().undo()
    expect(Object.keys(useEditor.getState().document.nodes)).toHaveLength(0)
    useEditor.getState().redo()
    expect(Object.keys(useEditor.getState().document.nodes)).toHaveLength(1)
  })
})
