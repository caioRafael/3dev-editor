import type { EditorTool, PrimitiveKind } from '../document/types'
import type { BooleanKind } from '../document/types'
import { useEditor } from '../document/store'

const MODES: { tool: EditorTool; label: string }[] = [
  { tool: 'select', label: 'Selecionar' },
  { tool: 'move', label: 'Mover' },
  { tool: 'rotate', label: 'Girar' },
  { tool: 'scale', label: 'Escalar' }
]

const PRIMITIVES: { kind: PrimitiveKind; label: string }[] = [
  { kind: 'cuboid', label: 'Cubo' },
  { kind: 'cylinder', label: 'Cilindro' },
  { kind: 'sphere', label: 'Esfera' }
]

const BOOLEANS: { kind: BooleanKind; label: string }[] = [
  { kind: 'union', label: 'União' },
  { kind: 'difference', label: 'Diferença' },
  { kind: 'intersection', label: 'Interseção' }
]

export function Toolbar(): React.JSX.Element {
  const tool = useEditor((state) => state.tool)
  return (
    <div className="flex w-28 shrink-0 flex-col gap-1 border-r border-[#2c3240] bg-[#1b1e27] p-2">
      {MODES.map((item) => (
        <button
          key={item.tool}
          type="button"
          className={buttonClass(tool === item.tool)}
          onClick={() => useEditor.getState().setTool(item.tool)}
        >
          {item.label}
        </button>
      ))}
      <div className="my-1 h-px bg-[#2c3240]" />
      {PRIMITIVES.map((item) => (
        <button
          key={item.kind}
          type="button"
          className={buttonClass(false)}
          onClick={() => useEditor.getState().addPrimitive(item.kind)}
        >
          {item.label}
        </button>
      ))}
      <div className="my-1 h-px bg-[#2c3240]" />
      {BOOLEANS.map((item) => (
        <button
          key={item.kind}
          type="button"
          className={buttonClass(false)}
          onClick={() => useEditor.getState().applyBoolean(item.kind)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function buttonClass(active: boolean): string {
  return `rounded-md px-2 py-1.5 text-left text-[12px] ${
    active ? 'bg-[#d97757] text-[#1c120e]' : 'text-[#d5d8e0] hover:bg-[#2a3040]'
  }`
}
