import { useEffect, useId, useRef, useState } from 'react'
import {
  Box,
  Circle,
  Cylinder,
  Ellipse,
  MousePointer2,
  Move,
  Pentagon,
  Rotate3d,
  Scaling,
  Shapes,
  Spline,
  Square,
  SquaresIntersect,
  SquaresSubtract,
  SquaresUnite,
  Star,
  Type,
  createLucideIcon,
  type LucideIcon
} from 'lucide-react'
import type { BooleanKind, EditorTool, PrimitiveKind, ShapeProfileKind } from '../document/types'
import { useEditor } from '../document/store'

const SphereIcon = createLucideIcon('sphere', [
  ['circle', { cx: '12', cy: '12', r: '9' }],
  ['ellipse', { cx: '12', cy: '12', rx: '4.5', ry: '9' }],
  ['path', { d: 'M3 12h18' }]
])

const MODES: { tool: EditorTool; label: string; icon: LucideIcon }[] = [
  { tool: 'select', label: 'Selecionar', icon: MousePointer2 },
  { tool: 'move', label: 'Mover', icon: Move },
  { tool: 'rotate', label: 'Girar', icon: Rotate3d },
  { tool: 'scale', label: 'Escalar', icon: Scaling }
]

const PRIMITIVES: { kind: PrimitiveKind; label: string; icon: LucideIcon }[] = [
  { kind: 'cuboid', label: 'Cubo', icon: Box },
  { kind: 'cylinder', label: 'Cilindro', icon: Cylinder },
  { kind: 'sphere', label: 'Esfera', icon: SphereIcon }
]

const PROFILES: { kind: ShapeProfileKind; label: string; icon: LucideIcon }[] = [
  { kind: 'rect', label: 'Retângulo', icon: Square },
  { kind: 'circle', label: 'Círculo', icon: Circle },
  { kind: 'ellipse', label: 'Elipse', icon: Ellipse },
  { kind: 'ngon', label: 'Polígono', icon: Pentagon },
  { kind: 'star', label: 'Estrela', icon: Star },
  { kind: 'text', label: 'Texto', icon: Type }
]

const BOOLEANS: { kind: BooleanKind; label: string; icon: LucideIcon }[] = [
  { kind: 'union', label: 'União', icon: SquaresUnite },
  { kind: 'difference', label: 'Diferença', icon: SquaresSubtract },
  { kind: 'intersection', label: 'Interseção', icon: SquaresIntersect }
]

export function Toolbar(): React.JSX.Element {
  const tool = useEditor((state) => state.tool)
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && rootRef.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <div className="relative z-20 flex h-11 shrink-0 items-center gap-1 border-b border-[#2c3240] bg-[#1b1e27] px-2">
      {MODES.map((item) => (
        <IconButton
          key={item.tool}
          label={item.label}
          icon={item.icon}
          active={tool === item.tool}
          pressed={tool === item.tool}
          onClick={() => useEditor.getState().setTool(item.tool)}
        />
      ))}
      <Divider />
      <div className="relative" ref={rootRef}>
        <IconButton
          label="Formas"
          icon={Shapes}
          active={open}
          showTooltip={!open}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((current) => !current)}
        />
        {open ? (
          <div
            id={menuId}
            role="menu"
            className="absolute top-full left-0 z-20 mt-1 w-44 rounded-md border border-[#2c3240] bg-[#1b1e27] p-1 shadow-xl"
          >
            <p className="px-2 pt-1 text-[10px] tracking-wide text-[#8b93a3] uppercase">3D</p>
            {PRIMITIVES.map((item) => (
              <MenuItem
                key={item.kind}
                label={item.label}
                icon={item.icon}
                onClick={() => useEditor.getState().addPrimitive(item.kind)}
                close={() => setOpen(false)}
              />
            ))}
            <p className="px-2 pt-2 text-[10px] tracking-wide text-[#8b93a3] uppercase">2D</p>
            {PROFILES.map((item) => (
              <MenuItem
                key={item.kind}
                label={item.label}
                icon={item.icon}
                onClick={() => useEditor.getState().addProfile(item.kind)}
                close={() => setOpen(false)}
              />
            ))}
            <MenuItem
              label="SVG"
              icon={Spline}
              onClick={() => void importSvg()}
              close={() => setOpen(false)}
            />
          </div>
        ) : null}
      </div>
      <Divider />
      {BOOLEANS.map((item) => (
        <IconButton
          key={item.kind}
          label={item.label}
          icon={item.icon}
          onClick={() => useEditor.getState().applyBoolean(item.kind)}
        />
      ))}
    </div>
  )
}

function IconButton({
  label,
  icon: Icon,
  active = false,
  pressed,
  showTooltip = true,
  onClick,
  ...buttonProps
}: {
  label: string
  icon: LucideIcon
  active?: boolean
  pressed?: boolean
  showTooltip?: boolean
  onClick: () => void
} & Pick<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-haspopup' | 'aria-expanded' | 'aria-controls'
>): React.JSX.Element {
  const button = (
    <button
      type="button"
      className={buttonClass(active)}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      {...buttonProps}
    >
      <Icon size={16} />
    </button>
  )
  if (!showTooltip) return button
  return <Tooltip label={label}>{button}</Tooltip>
}

function Tooltip({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="group relative">
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-full left-1/2 z-30 mt-1.5 -translate-x-1/2 rounded-md border border-[#2c3240] bg-[#14161b] px-2 py-1 text-[11px] whitespace-nowrap text-[#e7e9ee] shadow-lg group-focus-within:visible group-hover:visible"
      >
        {label}
      </span>
    </div>
  )
}

function MenuItem({
  label,
  icon: Icon,
  onClick,
  close
}: {
  label: string
  icon: LucideIcon
  onClick: () => void
  close: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[#d5d8e0] hover:bg-[#2a3040]"
      onClick={() => {
        close()
        onClick()
      }}
    >
      <Icon size={16} />
      {label}
    </button>
  )
}

function Divider(): React.JSX.Element {
  return <div className="mx-1 h-5 w-px bg-[#2c3240]" />
}

function buttonClass(active: boolean): string {
  return `flex h-8 w-8 items-center justify-center rounded-md ${
    active ? 'bg-[#d97757] text-[#1c120e]' : 'text-[#d5d8e0] hover:bg-[#2a3040]'
  }`
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
