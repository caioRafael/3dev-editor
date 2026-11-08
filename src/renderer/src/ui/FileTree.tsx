import { useEffect, useState } from 'react'
import { ChevronRight, File, FileCode, FileJson, Folder, FolderOpen } from 'lucide-react'
import { componentNames, MAIN_FILE } from '../document/files'
import { useEditor } from '../document/store'
import type { ProjectEntry, ProjectTree } from '../../../shared/api'
import { ComponentNameModal } from './ComponentNameModal'
import { readEditorApi } from './editorApi'
import { PanelHeader } from './PanelHeader'

export function FileTree(): React.JSX.Element {
  const filePath = useEditor((state) => state.filePath)
  const filesNonce = useEditor((state) => state.filesNonce)
  const document = useEditor((state) => state.document)
  const components = componentNames(document)
  const [loaded, setLoaded] = useState<{ path: string; tree: ProjectTree | null } | null>(null)
  const [selection, setSelection] = useState<{ path: string; key: string } | null>(null)
  const [naming, setNaming] = useState(false)
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
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

  function toggle(key: string): void {
    setClosed((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openFolder(key: string): void {
    choose(key)
    toggle(key)
  }

  function openCodeFile(fileName: string): void {
    choose(fileName === MAIN_FILE ? 'code/main.scad' : `code/components/${fileName}.scad`)
    useEditor.getState().openFile(fileName)
  }

  const rootName = tree?.rootName ?? (filePath ? folderName(filePath) : 'Sem projeto')
  const jsonName = tree?.jsonName ?? (filePath ? baseName(filePath) : null)
  const message = hint(phase, tree?.isProject === true)

  return (
    <section className="flex min-h-0 flex-1 flex-col border-t border-[#2c3240]">
      <PanelHeader title="Arquivos">
        <button
          type="button"
          className="ml-auto rounded-md px-1.5 py-0.5 font-normal text-[#e7e9ee] hover:bg-[#2a3040]"
          onClick={() => setNaming(true)}
        >
          Novo componente
        </button>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <TreeButton
          label={rootName}
          depth={0}
          kind="directory"
          open={!closed.has('root')}
          selected={selected === 'root'}
          onClick={() => openFolder('root')}
        />
        {closed.has('root') ? null : (
          <>
            {jsonName ? (
              <TreeButton
                label={jsonName}
                depth={1}
                kind="file"
                selected={selected === jsonName}
                onClick={() => choose(jsonName)}
              />
            ) : null}
            <TreeButton
              label="code"
              depth={1}
              kind="directory"
              open={!closed.has('code')}
              selected={selected === 'code'}
              onClick={() => openFolder('code')}
            />
            {closed.has('code') ? null : (
              <>
                <TreeButton
                  label="main.scad"
                  depth={2}
                  kind="file"
                  selected={document.activeFile === MAIN_FILE}
                  onClick={() => openCodeFile(MAIN_FILE)}
                />
                <TreeButton
                  label="components"
                  depth={2}
                  kind="directory"
                  open={!closed.has('code/components')}
                  selected={selected === 'code/components'}
                  onClick={() => openFolder('code/components')}
                />
                {closed.has('code/components')
                  ? null
                  : components.map((name) => (
                      <TreeButton
                        key={name}
                        label={`${name}.scad`}
                        depth={3}
                        kind="file"
                        selected={document.activeFile === name}
                        onClick={() => openCodeFile(name)}
                      />
                    ))}
                <EntryList
                  entries={(tree?.code ?? []).filter(
                    (entry) => entry.name !== 'main.scad' && entry.name !== 'components'
                  )}
                  prefix="code"
                  depth={2}
                  selected={selected}
                  closed={closed}
                  onSelect={choose}
                  onToggle={openFolder}
                />
              </>
            )}
            <TreeButton
              label="output"
              depth={1}
              kind="directory"
              open={!closed.has('output')}
              selected={selected === 'output'}
              onClick={() => openFolder('output')}
            />
            <OutputEntries
              tree={tree}
              closed={closed}
              selected={selected}
              onSelect={choose}
              onToggle={openFolder}
            />
          </>
        )}
        {message ? <p className="px-2 py-2 text-[12px] text-[#8b93a3]">{message}</p> : null}
      </div>
      {naming ? <ComponentNameModal onClose={() => setNaming(false)} /> : null}
    </section>
  )
}

function OutputEntries({
  tree,
  closed,
  selected,
  onSelect,
  onToggle
}: {
  tree: ProjectTree | null
  closed: ReadonlySet<string>
  selected: string | null
  onSelect: (key: string) => void
  onToggle: (key: string) => void
}): React.JSX.Element | null {
  if (closed.has('output')) return null
  if (tree?.isProject && tree.output.length === 0) {
    return (
      <p className="px-2 py-1 text-[12px] text-[#8b93a3]" style={{ paddingLeft: 8 + 2 * 12 + 18 }}>
        Nenhuma saída
      </p>
    )
  }
  return (
    <EntryList
      entries={tree?.output ?? []}
      prefix="output"
      depth={2}
      selected={selected}
      closed={closed}
      onSelect={onSelect}
      onToggle={onToggle}
    />
  )
}

function EntryList({
  entries,
  prefix,
  depth,
  selected,
  closed,
  onSelect,
  onToggle
}: {
  entries: ProjectEntry[]
  prefix: string
  depth: number
  selected: string | null
  closed: ReadonlySet<string>
  onSelect: (key: string) => void
  onToggle: (key: string) => void
}): React.JSX.Element {
  return (
    <>
      {entries.map((entry) => {
        const key = `${prefix}/${entry.name}`
        const directory = entry.kind === 'directory'
        const open = directory && !closed.has(key)
        return (
          <div key={key}>
            <TreeButton
              label={entry.name}
              depth={depth}
              kind={entry.kind}
              open={open}
              selected={selected === key}
              onClick={() => (directory ? onToggle(key) : onSelect(key))}
            />
            {open && entry.children.length > 0 ? (
              <EntryList
                entries={entry.children}
                prefix={key}
                depth={depth + 1}
                selected={selected}
                closed={closed}
                onSelect={onSelect}
                onToggle={onToggle}
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
  kind,
  open = false,
  selected,
  onClick
}: {
  label: string
  depth: number
  kind: 'file' | 'directory'
  open?: boolean
  selected: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[12px] text-[#d5d8e0] ${selected ? 'bg-[#343c4e]' : 'hover:bg-[#262b38]'}`}
      style={{ paddingLeft: 8 + depth * 12 }}
      aria-pressed={selected}
      aria-expanded={kind === 'directory' ? open : undefined}
      onClick={onClick}
    >
      {kind === 'directory' ? (
        <ChevronRight size={12} className={`shrink-0 text-[#8b93a3] ${open ? 'rotate-90' : ''}`} />
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <TreeGlyph kind={kind} open={open} label={label} />
      <span className="truncate">{label}</span>
    </button>
  )
}

function TreeGlyph({
  kind,
  open,
  label
}: {
  kind: 'file' | 'directory'
  open: boolean
  label: string
}): React.JSX.Element {
  const className = 'shrink-0 text-[#8b93a3]'
  if (kind === 'directory') {
    return open ? (
      <FolderOpen size={14} className={className} />
    ) : (
      <Folder size={14} className={className} />
    )
  }
  if (label.endsWith('.json')) return <FileJson size={14} className={className} />
  if (label.endsWith('.scad')) return <FileCode size={14} className={className} />
  return <File size={14} className={className} />
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
  if (phase === 'empty') return 'Crie um projeto para gravar a pasta.'
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
