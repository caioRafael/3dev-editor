import { useEffect, useState } from 'react'
import { useEditor } from '../document/store'
import type { ProjectEntry, ProjectTree } from '../../../shared/api'
import { readEditorApi } from './editorApi'

export function FileTree(): React.JSX.Element {
  const filePath = useEditor((state) => state.filePath)
  const filesNonce = useEditor((state) => state.filesNonce)
  const [loaded, setLoaded] = useState<{ path: string; tree: ProjectTree | null } | null>(null)
  const [selection, setSelection] = useState<{ path: string; key: string } | null>(null)
  const tree = loaded?.path === filePath ? loaded.tree : null
  const selectionPath = filePath ?? ''
  const selected = selection?.path === selectionPath ? selection.key : null
  const phase = treePhase(filePath, loaded)

  useEffect(() => {
    if (!filePath) return
    const api = readEditorApi()
    if (!api) return
    let cancelled = false
    void api.listProjectTree(filePath).then((result) => {
      if (!cancelled) setLoaded({ path: filePath, tree: result })
    })
    return () => {
      cancelled = true
    }
  }, [filePath, filesNonce])

  function choose(key: string): void {
    setSelection({ path: selectionPath, key })
  }

  const rootName = tree?.rootName ?? (filePath ? folderName(filePath) : 'Sem projeto')
  const jsonName = tree?.jsonName ?? (filePath ? baseName(filePath) : null)
  const message = hint(phase, tree?.isProject === true)

  return (
    <section className="flex min-h-0 flex-1 flex-col border-t border-[#2c3240]">
      <header className="border-b border-[#2c3240] px-3 py-2 text-[12px] tracking-wide text-[#9aa3b2] uppercase">
        Arquivos
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <p className="truncate px-2 py-1 text-[12px] font-medium text-[#e7e9ee]">{rootName}</p>
        {jsonName ? (
          <TreeButton
            label={jsonName}
            depth={1}
            selected={selected === jsonName}
            onClick={() => choose(jsonName)}
          />
        ) : null}
        <TreeButton
          label="code"
          depth={1}
          selected={selected === 'code'}
          onClick={() => choose('code')}
        />
        <EntryList
          entries={tree?.code ?? []}
          prefix="code"
          depth={2}
          selected={selected}
          onSelect={choose}
        />
        <TreeButton
          label="output"
          depth={1}
          selected={selected === 'output'}
          onClick={() => choose('output')}
        />
        {tree?.isProject && tree.output.length === 0 ? (
          <p className="px-2 py-1 text-[12px] text-[#8b93a3]" style={{ paddingLeft: 8 + 2 * 12 }}>
            Nenhuma saída
          </p>
        ) : (
          <EntryList
            entries={tree?.output ?? []}
            prefix="output"
            depth={2}
            selected={selected}
            onSelect={choose}
          />
        )}
        {message ? <p className="px-2 py-2 text-[12px] text-[#8b93a3]">{message}</p> : null}
      </div>
    </section>
  )
}

function EntryList({
  entries,
  prefix,
  depth,
  selected,
  onSelect
}: {
  entries: ProjectEntry[]
  prefix: string
  depth: number
  selected: string | null
  onSelect: (key: string) => void
}): React.JSX.Element {
  return (
    <>
      {entries.map((entry) => {
        const key = `${prefix}/${entry.name}`
        return (
          <div key={key}>
            <TreeButton
              label={entry.name}
              depth={depth}
              selected={selected === key}
              onClick={() => onSelect(key)}
            />
            {entry.kind === 'directory' && entry.children.length > 0 ? (
              <EntryList
                entries={entry.children}
                prefix={key}
                depth={depth + 1}
                selected={selected}
                onSelect={onSelect}
              />
            ) : null}
          </div>
        )
      })}
    </>
  )
}

function TreeButton({
  label,
  depth,
  selected,
  onClick
}: {
  label: string
  depth: number
  selected: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`block w-full truncate rounded-md py-1 pr-2 text-left text-[12px] ${selected ? 'bg-[#343c4e]' : 'hover:bg-[#262b38]'}`}
      style={{ paddingLeft: 8 + depth * 12 }}
      aria-pressed={selected}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function treePhase(
  filePath: string | null,
  loaded: { path: string; tree: ProjectTree | null } | null
): 'empty' | 'loading' | 'ready' | 'missing' {
  if (!filePath) return 'empty'
  if (!loaded || loaded.path !== filePath) return readEditorApi() ? 'loading' : 'missing'
  return loaded.tree ? 'ready' : 'missing'
}

function hint(phase: 'empty' | 'loading' | 'ready' | 'missing', isProject: boolean): string {
  if (phase === 'empty') return 'Salve para criar a pasta do projeto.'
  if (phase === 'missing') return 'Não foi possível ler a pasta do projeto.'
  if (phase === 'ready' && !isProject) return 'Este arquivo ainda não é uma pasta de projeto.'
  return ''
}

function folderName(filePath: string): string {
  const parts = filePath.split(/[/\\]/).filter((part) => part.length > 0)
  return parts.length >= 2 ? (parts[parts.length - 2] ?? 'Sem projeto') : 'Sem projeto'
}

function baseName(filePath: string): string {
  const parts = filePath.split(/[/\\]/).filter((part) => part.length > 0)
  return parts[parts.length - 1] ?? 'modelo'
}
