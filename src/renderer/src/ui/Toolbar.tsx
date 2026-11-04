import { useEffect, useId, useRef, useState } from 'react'
import {
  Component,
  MousePointer2,
  Move,
  Rotate3d,
  Scaling,
  Shapes,
  Spline,
  SquaresIntersect,
  SquaresSubtract,
  SquaresUnite,
  type LucideIcon
} from 'lucide-react'
import type { BooleanKind, EditorTool } from '../document/types'
import { componentNames } from '../document/files'
import { useEditor } from '../document/store'
import { PRIMITIVES, PROFILES } from './shapeCatalog'

const MODES: { tool: EditorTool; label: string; icon: LucideIcon }[] = [
  { tool: 'select', label: 'Selecionar', icon: MousePointer2 },
  { tool: 'move', label: 'Mover', icon: Move },
  { tool: 'rotate', label: 'Girar', icon: Rotate3d },
  { tool: 'scale', label: 'Escalar', icon: Scaling }
]

const BOOLEANS: { kind: BooleanKind; label: string; icon: LucideIcon }[] = [
  { kind: 'union', label: 'União', icon: SquaresUnite },
  { kind: 'difference', label: 'Diferença', icon: SquaresSubtract },
  { kind: 'intersection', label: 'Interseção', icon: SquaresIntersect }
]

export function Toolbar(): React.JSX.Element {
  const tool = useEditor((state) => state.tool)
  const document = useEditor((state) => state.document)
  const components = componentNames(document).filter((name) => name !== document.activeFile)
  const [open, setOpen] = useState(false)
  const [componentsOpen, setComponentsOpen] = useState(false)
  const menuId = useId()
  const componentMenuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const componentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open && !componentsOpen) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      setComponentsOpen(false)
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && rootRef.current?.contains(target)) return
      if (target instanceof Node && componentRef.current?.contains(target)) return
      setOpen(false)
      setComponentsOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, componentsOpen])

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
          onClick={() => {
            setComponentsOpen(false)
            setOpen((current) => !current)
          }}
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
      <div className="relative" ref={componentRef}>
        <IconButton
          label="Componentes"
          icon={Component}
          active={componentsOpen}
          showTooltip={!componentsOpen}
          aria-haspopup="menu"
          aria-expanded={componentsOpen}
          aria-controls={componentMenuId}
          onClick={() => {
            setOpen(false)
            setComponentsOpen((current) => !current)
          }}
        />
        {componentsOpen ? (
          <div
            id={componentMenuId}
            role="menu"
            className="absolute top-full left-0 z-20 mt-1 w-44 rounded-md border border-[#2c3240] bg-[#1b1e27] p-1 shadow-xl"
          >
            {components.length === 0 ? (
              <p className="px-2 py-1.5 text-[12px] text-[#8b93a3]">Nenhum componente</p>
            ) : (
              components.map((name) => (
                <MenuItem
                  key={name}
                  label={name}
                  icon={Component}
                  onClick={() => useEditor.getState().addComponent(name)}
                  close={() => setComponentsOpen(false)}
                />
              ))
            )}
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
