import type { EditorTool, PrimitiveKind, ShapeProfileKind } from '../document/types'
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

const PROFILES: { kind: ShapeProfileKind; label: string }[] = [
  { kind: 'rect', label: 'Retângulo' },
  { kind: 'circle', label: 'Círculo' },
  { kind: 'ellipse', label: 'Elipse' },
  { kind: 'ngon', label: 'Polígono' },
  { kind: 'star', label: 'Estrela' },
  { kind: 'text', label: 'Texto' }
]

const BOOLEANS: { kind: BooleanKind; label: string }[] = [
  { kind: 'union', label: 'União' },
  { kind: 'difference', label: 'Diferença' },
  { kind: 'intersection', label: 'Interseção' }
]

export function Toolbar(): React.JSX.Element {
  const tool = useEditor((state) => state.tool)
  return (
    <div className="flex min-h-0 w-32 shrink-0 flex-col gap-1 overflow-y-auto border-r border-[#2c3240] bg-[#1b1e27] p-2">
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
      <p className="px-2 pt-1 text-[10px] tracking-wide text-[#8b93a3] uppercase">Perfis</p>
      {PROFILES.map((item) => (
        <button
          key={item.kind}
          type="button"
          className={buttonClass(false)}
          onClick={() => useEditor.getState().addProfile(item.kind)}
        >
          {item.label}
        </button>
      ))}
      <button type="button" className={buttonClass(false)} onClick={() => void importSvg()}>
        SVG
      </button>
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

async function importSvg(): Promise<void> {
  const api = window.api
  if (!api?.pickSvg) {
    useEditor.getState().setStatus('A importação de SVG roda no aplicativo Electron.')
    return
  }
  const file = await api.pickSvg()
  if (!file) return
  if (!file.source.trim()) {
    useEditor.getState().setStatus('O SVG está vazio ou passa de 1,5 MB.')
    return
  }
  useEditor.getState().addSvg(file.name, file.source)
}

function buttonClass(active: boolean): string {
  return `rounded-md px-2 py-1.5 text-left text-[12px] ${
    active ? 'bg-[#d97757] text-[#1c120e]' : 'text-[#d5d8e0] hover:bg-[#2a3040]'
  }`
}
