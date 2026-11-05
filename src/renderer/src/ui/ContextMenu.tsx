import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { componentNames } from '../document/files'
import { useEditor } from '../document/store'
import { PRIMITIVES, PROFILES } from './shapeCatalog'

const MENU_WIDTH = 176
const MENU_LIMIT = 220
const MARGIN = 8

export function ContextMenu({
  x,
  y,
  onClose
}: {
  x: number
  y: number
  onClose: () => void
}): React.JSX.Element {
  const project = useEditor((state) => state.document)
  const names = componentNames(project).filter((name) => name !== project.activeFile)
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }))
  const placement = placeContextMenu(x, y, viewport.width, viewport.height)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    const onPointerDown = (): void => onClose()
    const onResize = (): void =>
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onResize)
    }
  }, [onClose])

  return createPortal(
    <div
      role="menu"
      className="fixed z-50 w-44 overflow-y-auto overscroll-contain rounded-md border border-[#2c3240] bg-[#1b1e27] p-1 shadow-xl"
      style={{
        left: placement.left,
        top: placement.top,
        bottom: placement.bottom,
        maxHeight: placement.maxHeight
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <p className="px-2 pt-1 text-[10px] tracking-wide text-[#8b93a3] uppercase">
        Adicionar forma
      </p>
      {PRIMITIVES.map((item) => (
        <MenuRow
          key={item.kind}
          label={item.label}
          onClick={() => useEditor.getState().addPrimitive(item.kind)}
          close={onClose}
        />
      ))}
      {PROFILES.map((item) => (
        <MenuRow
          key={item.kind}
          label={item.label}
          onClick={() => useEditor.getState().addProfile(item.kind)}
          close={onClose}
        />
      ))}
      <MenuRow label="SVG" onClick={() => void importSvg()} close={onClose} />
      <p className="px-2 pt-2 text-[10px] tracking-wide text-[#8b93a3] uppercase">
        Adicionar componente
      </p>
      {names.length === 0 ? (
        <p className="px-2 py-1.5 text-[12px] text-[#8b93a3]">Nenhum componente</p>
      ) : (
        names.map((name) => (
          <MenuRow
            key={name}
            label={name}
            onClick={() => useEditor.getState().addComponent(name)}
            close={onClose}
          />
        ))
      )}
    </div>,
    document.body
  )
}

interface MenuPlacement {
  left: number
  top?: number
  bottom?: number
  maxHeight: number
}

function placeContextMenu(x: number, y: number, width: number, height: number): MenuPlacement {
  const spaceBelow = Math.max(0, height - y - MARGIN)
  const spaceAbove = Math.max(0, y - MARGIN)
  const openUp = spaceBelow < MENU_LIMIT && spaceAbove > spaceBelow
  const maxHeight = Math.min(MENU_LIMIT, openUp ? spaceAbove : spaceBelow)
  const left = Math.max(MARGIN, Math.min(x, width - MENU_WIDTH - MARGIN))
  if (openUp) return { left, bottom: height - y, maxHeight }
  return { left, top: y, maxHeight }
}

function MenuRow({
  label,
  onClick,
  close
}: {
  label: string
  onClick: () => void
  close: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      className="block w-full rounded-md px-2 py-1 text-left text-[12px] text-[#d5d8e0] hover:bg-[#2a3040]"
      onClick={() => {
        close()
        onClick()
      }}
    >
      {label}
    </button>
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
