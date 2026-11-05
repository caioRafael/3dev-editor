import { describe, expect, it } from 'vitest'
import type { BooleanKind, EditorTool, OperationKind } from '../document/types'
import { PRIMITIVES, PROFILES } from './shapeCatalog'
import {
  componentTip,
  tipForBoolean,
  tipForMenu,
  tipForOperation,
  tipForPrimitive,
  tipForProfile,
  tipForSvg,
  tipForTool,
  useFunctionTip,
  type FunctionMenuId
} from './functionTips'

const TOOLS: EditorTool[] = ['select', 'move', 'rotate', 'scale']
const MENUS: FunctionMenuId[] = ['shapes', 'components', 'solid', 'flat']
const BOOLEANS: BooleanKind[] = ['union', 'difference', 'intersection']
const OPERATIONS: OperationKind[] = [
  'offset',
  'hull2d',
  'hull',
  'mirror',
  'revolve',
  'projection',
  'resize',
  'minkowski'
]
const OPERATION_TITLES: Record<OperationKind, string> = {
  offset: 'Offset',
  hull2d: 'Casca 2D',
  hull: 'Casca 3D',
  mirror: 'Espelhar',
  revolve: 'Revolução',
  projection: 'Projeção',
  resize: 'Redimensionar',
  minkowski: 'Minkowski'
}

describe('function tips', () => {
  it('covers every toolbar tool, shape and operation', () => {
    for (const tool of TOOLS) {
      const tip = tipForTool(tool)
      expect(tip.id).toBe(`tool:${tool}`)
      expect(tip.body.length).toBeGreaterThan(0)
    }
    for (const menu of MENUS) {
      expect(tipForMenu(menu).body.length).toBeGreaterThan(0)
    }
    for (const item of PRIMITIVES) {
      const tip = tipForPrimitive(item.kind)
      expect(tip.title).toBe(item.label)
      expect(tip.body.length).toBeGreaterThan(0)
    }
    for (const item of PROFILES) {
      const tip = tipForProfile(item.kind)
      expect(tip.title).toBe(item.label)
      expect(tip.body.length).toBeGreaterThan(0)
    }
    expect(tipForSvg().title).toBe('SVG')
    for (const kind of BOOLEANS) {
      const tip = tipForBoolean(kind)
      expect(tip.body).toContain('dois sólidos')
      expect(tip.body).toContain('Clicar de novo')
    }
    for (const kind of OPERATIONS) {
      const tip = tipForOperation(kind)
      expect(tip.title).toBe(OPERATION_TITLES[kind])
      expect(tip.body.length).toBeGreaterThan(0)
    }
    expect(componentTip('Tampa').title).toBe('Tampa')
    expect(componentTip('Tampa').body).toContain('arquivo do componente')
  })

  it('keeps a tip until it is replaced or dismissed, and follows the active tool', () => {
    useFunctionTip.setState({ current: tipForTool('select'), dismissedId: null })
    useFunctionTip.getState().show(tipForPrimitive('cuboid'))
    expect(useFunctionTip.getState().current.title).toBe('Cubo')
    expect(useFunctionTip.getState().dismissedId).toBeNull()

    useFunctionTip.getState().dismiss()
    expect(useFunctionTip.getState().dismissedId).toBe('shape:cuboid')

    useFunctionTip.getState().show(tipForPrimitive('cuboid'))
    expect(useFunctionTip.getState().dismissedId).toBeNull()
    expect(useFunctionTip.getState().current.title).toBe('Cubo')

    useFunctionTip.getState().syncTool('move')
    expect(useFunctionTip.getState().current.title).toBe('Mover')
    expect(useFunctionTip.getState().dismissedId).toBeNull()

    useFunctionTip.getState().dismiss()
    useFunctionTip.getState().syncTool('move')
    expect(useFunctionTip.getState().dismissedId).toBe('tool:move')

    useFunctionTip.setState({ current: tipForTool('select'), dismissedId: null })
  })
})
