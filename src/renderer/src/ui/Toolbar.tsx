import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Blend,
  Box,
  Boxes,
  Component,
  FlipHorizontal2,
  Hexagon,
  Maximize2,
  MousePointer2,
  Move,
  Projector,
  Rotate3d,
  RotateCw,
  Scaling,
  Square,
  Shapes,
  Spline,
  SquaresIntersect,
  SquaresSubtract,
  SquaresUnite,
  UnfoldHorizontal,
  type LucideIcon
} from 'lucide-react'
import {
  type BooleanKind,
  type EditorTool,
  type OperationKind,
  isGroupEnabled,
  isGroupNode,
  operationNeedsFlat
} from '../document/types'
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

const OPERATIONS: { kind: OperationKind; label: string; icon: LucideIcon }[] = [
  { kind: 'offset', label: 'Offset', icon: UnfoldHorizontal },
  { kind: 'hull2d', label: 'Casca 2D', icon: Hexagon },
  { kind: 'hull', label: 'Casca 3D', icon: Boxes },
  { kind: 'mirror', label: 'Espelhar', icon: FlipHorizontal2 },
  { kind: 'revolve', label: 'Revolução', icon: RotateCw },
  { kind: 'projection', label: 'Projeção', icon: Projector },
  { kind: 'resize', label: 'Redimensionar', icon: Maximize2 },
  { kind: 'minkowski', label: 'Minkowski', icon: Blend }
]

const FLAT_OPERATIONS = OPERATIONS.filter((item) => operationNeedsFlat(item.kind))
const SOLID_OPERATIONS = OPERATIONS.filter((item) => !operationNeedsFlat(item.kind))

type ToolbarMenuId = 'shapes' | 'components' | 'solid' | 'flat'

export function Toolbar(): React.JSX.Element {
  const tool = useEditor((state) => state.tool)
  const document = useEditor((state) => state.document)
  const activeGroup = useEditor((state) => {
    if (state.selection.length !== 1) return null
    const node = state.document.files[state.document.activeFile]?.nodes[state.selection[0]]
    if (!node || !isGroupNode(node) || !isGroupEnabled(node)) return null
    return node.kind
  })
  const components = componentNames(document).filter((name) => name !== document.activeFile)
  const [menu, setMenu] = useState<ToolbarMenuId | null>(null)
  const close = (): void => setMenu(null)
  const solidActive =
    BOOLEANS.some((item) => item.kind === activeGroup) ||
    SOLID_OPERATIONS.some((item) => item.kind === activeGroup)
  const flatActive = FLAT_OPERATIONS.some((item) => item.kind === activeGroup)

  return (
    <div className="relative z-30 flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-[#2c3240] bg-[#1b1e27] px-2">
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
      <ToolbarMenu id="shapes" label="Formas" icon={Shapes} menu={menu} setMenu={setMenu}>
        <p className="px-2 pt-1 text-[10px] tracking-wide text-[#8b93a3] uppercase">3D</p>
        {PRIMITIVES.map((item) => (
          <MenuItem
            key={item.kind}
            label={item.label}
            icon={item.icon}
            onClick={() => useEditor.getState().addPrimitive(item.kind)}
            close={close}
          />
        ))}
        <p className="px-2 pt-2 text-[10px] tracking-wide text-[#8b93a3] uppercase">2D</p>
        {PROFILES.map((item) => (
          <MenuItem
            key={item.kind}
            label={item.label}
            icon={item.icon}
            onClick={() => useEditor.getState().addProfile(item.kind)}
            close={close}
          />
        ))}
        <MenuItem label="SVG" icon={Spline} onClick={() => void importSvg()} close={close} />
      </ToolbarMenu>
      <ToolbarMenu
        id="components"
        label="Componentes"
        icon={Component}
        menu={menu}
        setMenu={setMenu}
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
              close={close}
            />
          ))
        )}
      </ToolbarMenu>
      <Divider />
      <ToolbarMenu
        id="solid"
        label="Operações 3D"
        icon={Box}
        menu={menu}
        setMenu={setMenu}
        highlighted={solidActive}
      >
        <p className="px-2 pt-1 text-[10px] tracking-wide text-[#8b93a3] uppercase">Booleanos</p>
        {BOOLEANS.map((item) => (
          <MenuItem
            key={item.kind}
            label={item.label}
            icon={item.icon}
            active={activeGroup === item.kind}
            onClick={() => useEditor.getState().applyBoolean(item.kind)}
            close={close}
          />
        ))}
        <p className="px-2 pt-2 text-[10px] tracking-wide text-[#8b93a3] uppercase">Sólidos</p>
        {SOLID_OPERATIONS.map((item) => (
          <MenuItem
            key={item.kind}
            label={item.label}
            icon={item.icon}
            active={activeGroup === item.kind}
            onClick={() => useEditor.getState().applyOperation(item.kind)}
            close={close}
          />
        ))}
      </ToolbarMenu>
      <ToolbarMenu
        id="flat"
        label="Operações 2D"
        icon={Square}
        menu={menu}
        setMenu={setMenu}
        highlighted={flatActive}
      >
        {FLAT_OPERATIONS.map((item) => (
          <MenuItem
            key={item.kind}
            label={item.label}
            icon={item.icon}
            active={activeGroup === item.kind}
            onClick={() => useEditor.getState().applyOperation(item.kind)}
            close={close}
          />
        ))}
      </ToolbarMenu>
    </div>
  )
}

function ToolbarMenu({
  id,
  label,
  icon,
  menu,
  setMenu,
  highlighted = false,
  children
}: {
  id: ToolbarMenuId
  label: string
  icon: LucideIcon
  menu: ToolbarMenuId | null
  setMenu: (menu: ToolbarMenuId | null) => void
  highlighted?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const open = menu === id
  const menuId = useId()
  const anchorRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (): void => setMenu(null)
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && anchorRef.current?.contains(target)) return
      if (target instanceof Node && menuRef.current?.contains(target)) return
      close()
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, setMenu])
  return (
    <div className="relative" ref={anchorRef}>
      <IconButton
        label={label}
        icon={icon}
        active={open || highlighted}
        pressed={highlighted}
        showTooltip={!open}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setMenu(open ? null : id)}
      />
      {open ? (
        <AnchoredMenu id={menuId} anchorRef={anchorRef} menuRef={menuRef}>
          {children}
        </AnchoredMenu>
      ) : null}
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
  const anchorRef = useRef<HTMLDivElement>(null)
  const [point, setPoint] = useState<AnchorPoint | null>(null)
  const show = (): void => setPoint(anchorCenter(anchorRef.current))
  const hide = (): void => setPoint(null)
  return (
    <div
      ref={anchorRef}
      className="relative"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {point
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-50 -translate-x-1/2 rounded-md border border-[#2c3240] bg-[#14161b] px-2 py-1 text-[11px] whitespace-nowrap text-[#e7e9ee] shadow-lg"
              style={{ top: point.top, left: point.left }}
            >
              {label}
            </span>,
            document.body
          )
        : null}
    </div>
  )
}

function AnchoredMenu({
  id,
  anchorRef,
  menuRef,
  children
}: {
  id: string
  anchorRef: React.RefObject<HTMLElement | null>
  menuRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
}): React.JSX.Element | null {
  const [point, setPoint] = useState<AnchorPoint | null>(null)
  useLayoutEffect(() => {
    const update = (): void => setPoint(anchorBelow(anchorRef.current))
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchorRef])
  if (!point) return null
  return createPortal(
    <div
      ref={menuRef}
      id={id}
      role="menu"
      className="fixed z-50 max-h-[70vh] w-44 overflow-auto rounded-md border border-[#2c3240] bg-[#1b1e27] p-1 shadow-xl"
      style={{ top: point.top, left: point.left }}
    >
      {children}
    </div>,
    document.body
  )
}

interface AnchorPoint {
  top: number
  left: number
}

function anchorBelow(element: HTMLElement | null): AnchorPoint | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  const width = 176
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  return { top: rect.bottom + 4, left }
}

function anchorCenter(element: HTMLElement | null): AnchorPoint | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return { top: rect.bottom + 6, left: rect.left + rect.width / 2 }
}

function MenuItem({
  label,
  icon: Icon,
  active = false,
  onClick,
  close
}: {
  label: string
  icon: LucideIcon
  active?: boolean
  onClick: () => void
  close: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      aria-pressed={active}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-[#2a3040] ${
        active ? 'bg-[#3a2a24] text-[#f2d2c4]' : 'text-[#d5d8e0]'
      }`}
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
