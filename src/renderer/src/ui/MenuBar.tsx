import { useEditor } from '../document/store'
import {
  exportCurrentScad,
  exportCurrentStl,
  openProjectFile,
  saveCurrentProject
} from './projectActions'

export function MenuBar({ onNew }: { onNew: () => void }): React.JSX.Element {
  const filePath = useEditor((state) => state.filePath)
  const isProject = useEditor((state) => state.isProject)
  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-[#2c3240] bg-[#1b1e27] px-2">
      <span className="px-2 text-[13px] font-semibold text-[#f3f5f8]">3dev</span>
      <MenuButton label="Novo" onClick={onNew} />
      <MenuButton label="Abrir" onClick={() => void openProjectFile()} />
      <MenuButton label="Salvar" onClick={() => void saveCurrentProject()} />
      <MenuButton label="Exportar SCAD" onClick={() => void exportCurrentScad()} />
      <MenuButton label="Renderizar" onClick={() => useEditor.getState().requestExactPreview()} />
      <MenuButton label="Exportar STL" onClick={() => void exportCurrentStl()} />
      <span className="ml-auto truncate px-2 text-[12px] text-[#8b93a3]">
        {projectLabel(filePath, isProject)}
      </span>
    </header>
  )
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      className="rounded-md px-2 py-1 text-[12px] text-[#e7e9ee] hover:bg-[#2a3040]"
      onClick={onClick}
    >
      {label}
    </button>
  )
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
