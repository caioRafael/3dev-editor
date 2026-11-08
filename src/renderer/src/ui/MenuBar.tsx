import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor } from '../document/store'
import {
  exportCurrentModel,
  exportCurrentScad,
  openProjectFile,
  saveCurrentProject
} from './projectActions'

type MenuId = 'file' | 'export'

export function MenuBar({ onNew }: { onNew: () => void }): React.JSX.Element {
  const filePath = useEditor((state) => state.filePath)
  const isProject = useEditor((state) => state.isProject)
  const [menu, setMenu] = useState<MenuId | null>(null)
  const close = (): void => setMenu(null)
  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-[#2c3240] bg-[#1b1e27] px-2">
      <span className="px-2 text-[13px] font-semibold text-[#f3f5f8]">3dev</span>
      <MenuDropdown id="file" label="Arquivo" menu={menu} setMenu={setMenu}>
        <MenuItem label="Novo" onClick={onNew} close={close} />
        <MenuItem label="Abrir" onClick={() => void openProjectFile()} close={close} />
        <MenuItem label="Salvar" onClick={() => void saveCurrentProject()} close={close} />
      </MenuDropdown>
      <MenuButton label="Renderizar" onClick={() => useEditor.getState().requestExactPreview()} />
      <MenuDropdown id="export" label="Exportar" menu={menu} setMenu={setMenu}>
        <p className="px-2 pt-1 text-[10px] tracking-wide text-[#8b93a3] uppercase">Código</p>
        <MenuItem label="OpenSCAD" onClick={() => void exportCurrentScad()} close={close} />
        <p className="px-2 pt-2 text-[10px] tracking-wide text-[#8b93a3] uppercase">Modelos</p>
        <MenuItem label="STL" onClick={() => void exportCurrentModel('stl')} close={close} />
        <MenuItem label="OBJ" onClick={() => void exportCurrentModel('obj')} close={close} />
        <MenuItem label="3MF" onClick={() => void exportCurrentModel('3mf')} close={close} />
      </MenuDropdown>
      <span className="ml-auto truncate px-2 text-[12px] text-[#8b93a3]">
        {projectLabel(filePath, isProject)}
      </span>
    </header>
  )
}

function MenuDropdown({
  id,
  label,
  menu,
  setMenu,
  children
}: {
  id: MenuId
  label: string
  menu: MenuId | null
  setMenu: (menu: MenuId | null) => void
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
      <button
        type="button"
        className={menuButtonClass(open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setMenu(open ? null : id)}
      >
        {label}
      </button>
      {open ? (
        <AnchoredMenu id={menuId} anchorRef={anchorRef} menuRef={menuRef}>
          {children}
        </AnchoredMenu>
      ) : null}
    </div>
  )
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <button type="button" className={menuButtonClass(false)} onClick={onClick}>
      {label}
    </button>
  )
}

function MenuItem({
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
      className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[12px] text-[#d5d8e0] hover:bg-[#2a3040]"
      onClick={() => {
        close()
        onClick()
      }}
    >
      {label}
    </button>
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

function menuButtonClass(open: boolean): string {
  return `rounded-md px-2 py-1 text-[12px] text-[#e7e9ee] hover:bg-[#2a3040] ${
    open ? 'bg-[#2a3040]' : ''
  }`
}

function projectLabel(filePath: string | null, isProject: boolean): string {
  if (!filePath) return 'Sem arquivo'
  if (isProject) return folderName(filePath)
  return baseName(filePath)
}

function folderName(filePath: string): string {
  const parts = filePath.split(/[/\\]/).filter((part) => part.length > 0)
  return parts.length >= 2 ? (parts[parts.length - 2] ?? 'Sem arquivo') : 'Sem arquivo'
}

function baseName(filePath: string): string {
  const parts = filePath.split(/[/\\]/).filter((part) => part.length > 0)
  return parts[parts.length - 1] ?? 'Sem arquivo'
}
