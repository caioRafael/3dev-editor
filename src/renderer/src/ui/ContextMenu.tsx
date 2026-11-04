import { useEffect } from 'react'
import { componentNames } from '../document/files'
import { useEditor } from '../document/store'
import { PRIMITIVES, PROFILES } from './shapeCatalog'

export function ContextMenu({
  x,
  y,
  onClose
}: {
  x: number
  y: number
  onClose: () => void
}): React.JSX.Element {
  const document = useEditor((state) => state.document)
  const names = componentNames(document).filter((name) => name !== document.activeFile)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    const onPointerDown = (): void => onClose()
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [onClose])

  return (
    <div
      role="menu"
      className="fixed z-30 max-h-[70vh] w-52 overflow-auto rounded-md border border-[#2c3240] bg-[#1b1e27] p-1 shadow-xl"
      style={{ left: x, top: y }}
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
    </div>
  )
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
      className="block w-full rounded-md px-2 py-1.5 text-left text-[12px] text-[#d5d8e0] hover:bg-[#2a3040]"
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
