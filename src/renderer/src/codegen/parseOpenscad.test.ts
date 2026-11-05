import { describe, expect, it } from 'vitest'
import { generateOpenscad } from './openscad'
import { parseOpenscad } from './parseOpenscad'
import {
  createBoolean,
  createComponentFile,
  createComponentInstance,
  createEmptyDocument,
  createOperation,
  createPrimitive,
  createProfile,
  createSvgProfile
} from '../document/tree'
import { MAIN_FILE, activeModel, replaceActive } from '../document/files'
import { type CuboidNode, type SphereNode } from '../document/types'
import { useEditor } from '../document/store'

describe('parseOpenscad', () => {
  it('round-trips an empty model', () => {
    const document = createEmptyDocument()
    const source = generateOpenscad(document)
    const parsed = parseOpenscad(source, document)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(generateOpenscad(parsed.document)).toBe(source)
  })

  it('round-trips a boolean and preserves ids when the text changes spacing', () => {
    const first = createPrimitive(createEmptyDocument(), 'cuboid')
    const second = createPrimitive(first.document, 'cylinder')
    const result = createBoolean(second.document, 'difference', [first.id, second.id])
    const source = generateOpenscad(result.document)
    const messy = source.replace('translate([', 'translate( [')
    const parsed = parseOpenscad(messy, result.document)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(generateOpenscad(parsed.document)).toBe(source)
    expect(activeModel(parsed.document).nodes[first.id]?.kind).toBe('cuboid')
    expect(activeModel(parsed.document).nodes[second.id]?.kind).toBe('cylinder')
  })

  it('updates a size from edited code and keeps the node identity', () => {
    const created = createPrimitive(createEmptyDocument(), 'cuboid')
    const source = generateOpenscad(created.document).replace('[20, 20, 20]', '[32, 18, 20]')
    const parsed = parseOpenscad(source, created.document)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const node = activeModel(parsed.document).nodes[created.id]
    expect(node?.name).toBe(created.name)
    expect(isCuboid(node) && node.size).toEqual({ x: 32, y: 18, z: 20 })
  })

  it('keeps hidden nodes that the source does not show', () => {
    const first = createPrimitive(createEmptyDocument(), 'cuboid')
    const second = createPrimitive(first.document, 'sphere')
    const sphere = activeModel(second.document).nodes[second.id]
    const document = replaceActive(second.document, {
      nodes: {
        ...activeModel(second.document).nodes,
        [second.id]: { ...sphere, visible: false }
      },
      assets: activeModel(second.document).assets
    })
    const parsed = parseOpenscad(generateOpenscad(document), document)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(activeModel(parsed.document).nodes[second.id]?.visible).toBe(false)
    expect(activeModel(parsed.document).nodes[first.id]?.kind).toBe('cuboid')
  })

  it('rejects edits to a locked solid', () => {
    const created = createPrimitive(createEmptyDocument(), 'cuboid')
    const node = activeModel(created.document).nodes[created.id]
    const document = replaceActive(created.document, {
      nodes: { [created.id]: { ...node, locked: true } },
      assets: activeModel(created.document).assets
    })
    const source = generateOpenscad(document).replace('[20, 20, 20]', '[21, 20, 20]')
    const parsed = parseOpenscad(source, document)
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.message).toContain('travado')
  })

  it('reports unsupported syntax with a line number', () => {
    const parsed = parseOpenscad(
      'include <BOSL2/std.scad>\n$fn = 48;\ncube([10, 10, 10]);\n',
      createEmptyDocument()
    )
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.line).toBe(3)
    expect(parsed.message).toContain('cube')
  })

  it('round-trips rounding on a boolean result', () => {
    const first = createPrimitive(createEmptyDocument(), 'cuboid')
    const second = createPrimitive(first.document, 'cuboid')
    const result = createBoolean(second.document, 'union', [first.id, second.id])
    if (!result.id) throw new Error('expected boolean')
    const booleanNode = activeModel(result.document).nodes[result.id]
    if (booleanNode?.kind !== 'union') throw new Error('expected union')
    const document = replaceActive(result.document, {
      nodes: {
        ...activeModel(result.document).nodes,
        [result.id]: { ...booleanNode, rounding: 2 }
      },
      assets: activeModel(result.document).assets
    })
    const source = generateOpenscad(document)
    const parsed = parseOpenscad(source, document)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(activeModel(parsed.document).nodes[result.id]).toMatchObject({
      kind: 'union',
      rounding: 2
    })
    expect(generateOpenscad(parsed.document)).toBe(source)
  })

  it('rejects round3d around a primitive', () => {
    const source = `round3d(r=2) {
    cuboid([10, 10, 10], anchor=CENTER);
}
`
    const parsed = parseOpenscad(source, createEmptyDocument())
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.message).toContain('round3d')
  })

  it('rejects rounding together with chamfer', () => {
    const source = `$fn = 48;
cuboid([10, 10, 10], rounding=1, chamfer=1, anchor=CENTER);
`
    const parsed = parseOpenscad(source, createEmptyDocument())
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.message).toContain('rounding')
  })

  it('rejects rotate wrapped outside translate', () => {
    const source = `rotate([0, 0, 45])
    translate([1, 0, 0])
        cuboid([10, 10, 10], anchor=CENTER);
`
    const parsed = parseOpenscad(source, createEmptyDocument())
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.message).toContain('ordem')
  })

  it('round-trips an extruded profile and keeps its id', () => {
    const created = createProfile(createEmptyDocument(), 'text')
    const source = generateOpenscad(created.document)
    const parsed = parseOpenscad(source, created.document)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(generateOpenscad(parsed.document)).toBe(source)
    expect(activeModel(parsed.document).nodes[created.id]?.kind).toBe('text')
  })

  it('round-trips an svg import against the stored asset', () => {
    const created = createSvgProfile(
      createEmptyDocument(),
      'mark.svg',
      '<svg viewBox="0 0 8 4" width="8mm" height="4mm"></svg>'
    )
    const source = generateOpenscad(created.document)
    const parsed = parseOpenscad(source, created.document)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(generateOpenscad(parsed.document)).toBe(source)
    expect(activeModel(parsed.document).assets).toEqual(activeModel(created.document).assets)
  })

  it('adds a sphere written into the source', () => {
    const created = createPrimitive(createEmptyDocument(), 'cuboid')
    const source = `${generateOpenscad(created.document).trimEnd()}
spheroid(d=10, anchor=CENTER);
`
    const parsed = parseOpenscad(source, created.document)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const sphere = Object.values(activeModel(parsed.document).nodes).find(
      (node) => node.kind === 'sphere'
    )
    expect(isSphere(sphere) && sphere.diameter).toBe(10)
    expect(sphere?.name).toBe('Esfera 1')
    expect(activeModel(parsed.document).nodes[created.id]?.kind).toBe('cuboid')
  })

  it('round-trips a component instance imported into main', () => {
    const pino = createComponentFile(createEmptyDocument(), 'Pino')
    const shaped = createPrimitive(pino.document, 'cuboid')
    const main = createComponentInstance({ ...shaped.document, activeFile: MAIN_FILE }, 'Pino')
    const componentSource = generateOpenscad(main.document, 'Pino')
    const mainSource = generateOpenscad(main.document, MAIN_FILE)
    expect(componentSource).toContain('module Pino() {')
    expect(componentSource).toContain('Pino();')
    expect(mainSource).toContain('use <components/Pino.scad>')
    expect(mainSource).toContain('Pino();')
    const parsedMain = parseOpenscad(mainSource, { ...main.document, activeFile: MAIN_FILE })
    const parsedPino = parseOpenscad(componentSource, { ...main.document, activeFile: 'Pino' })
    expect(parsedMain.ok).toBe(true)
    expect(parsedPino.ok).toBe(true)
    if (!parsedMain.ok || !parsedPino.ok) return
    expect(generateOpenscad(parsedMain.document, MAIN_FILE)).toBe(mainSource)
    expect(generateOpenscad(parsedPino.document, 'Pino')).toBe(componentSource)
  })
})

describe('operation round trip', () => {
  it('round-trips offset, hull, mirror, revolve, projection, resize and minkowski', () => {
    const circle = createProfile(createEmptyDocument(), 'circle')
    const offset = createOperation(circle.document, 'offset', [circle.id])
    expectRoundTrip(offset.document)

    const outer = createOperation(offset.document, 'offset', [offset.id ?? ''])
    expectRoundTrip(outer.document)

    const first = createPrimitive(createEmptyDocument(), 'cuboid')
    const second = createPrimitive(first.document, 'sphere')
    expectRoundTrip(createOperation(second.document, 'hull', [first.id, second.id]).document)
    expectRoundTrip(createOperation(first.document, 'mirror', [first.id]).document)
    expectRoundTrip(createOperation(circle.document, 'revolve', [circle.id]).document)
    expectRoundTrip(createOperation(first.document, 'projection', [first.id]).document)
    expectRoundTrip(createOperation(first.document, 'resize', [first.id]).document)
    expectRoundTrip(createOperation(second.document, 'minkowski', [first.id, second.id]).document)
  })
})

describe('applyCode', () => {
  it('pushes a code edit onto the undo stack', () => {
    useEditor.getState().newDocument()
    useEditor.getState().addPrimitive('cuboid')
    const current = useEditor.getState().document
    const id = Object.keys(activeModel(current).nodes)[0] ?? ''
    const source = generateOpenscad(current).replace('[20, 20, 20]', '[40, 20, 20]')
    const parsed = parseOpenscad(source, current)
    if (!parsed.ok) throw new Error(parsed.message)
    useEditor.getState().applyCode(parsed.document)
    const edited = activeModel(useEditor.getState().document).nodes[id]
    expect(isCuboid(edited) && edited.size.x).toBe(40)
    useEditor.getState().undo()
    const restored = activeModel(useEditor.getState().document).nodes[id]
    expect(isCuboid(restored) && restored.size.x).toBe(20)
  })
})

function expectRoundTrip(document: ReturnType<typeof createEmptyDocument>): void {
  const source = generateOpenscad(document)
  const parsed = parseOpenscad(source, document)
  expect(parsed.ok).toBe(true)
  if (!parsed.ok) return
  expect(generateOpenscad(parsed.document)).toBe(source)
}

function isCuboid(node: { kind: string } | undefined): node is CuboidNode {
  return node?.kind === 'cuboid'
}

function isSphere(node: { kind: string } | undefined): node is SphereNode {
  return node?.kind === 'sphere'
}
