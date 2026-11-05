import { activeModel } from '../document/files'
import { useEditor } from '../document/store'
import { getRoots } from '../document/tree'
import { isGroupEnabled, isGroupNode } from '../document/types'

export function Outliner(): React.JSX.Element {
  const document = useEditor((state) => state.document)
  const roots = getRoots(document)
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-[#2c3240] px-3 py-2 text-[12px] tracking-wide text-[#9aa3b2] uppercase">
        Modelo
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {roots.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-[#8b93a3]">
            Nenhum sólido. Crie um cubo, cilindro, esfera ou perfil.
          </p>
        ) : (
          roots.map((node) => <OutlinerNode key={node.id} id={node.id} depth={0} />)
        )}
      </div>
    </section>
  )
}

function OutlinerNode({ id, depth }: { id: string; depth: number }): React.JSX.Element | null {
  const node = useEditor((state) => activeModel(state.document).nodes[id])
  const selected = useEditor((state) => state.selection.includes(id))
  if (!node) return null
  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-md pr-1 ${selected ? 'bg-[#343c4e]' : 'hover:bg-[#262b38]'}`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <button
          type="button"
          className={`min-w-0 flex-1 truncate px-1 py-1 text-left text-[12px] ${
            isGroupNode(node) && !isGroupEnabled(node) ? 'text-[#8b93a3]' : ''
          }`}
          onClick={(event) => useEditor.getState().select(id, { additive: event.shiftKey })}
        >
          <span
            className="mr-2 inline-block h-2 w-2 rounded-full"
            style={{ background: node.appearance.color }}
          />
          {node.name}
        </button>
        {isGroupNode(node) ? (
          <button
            type="button"
            className="px-1 text-[11px] text-[#9aa3b2]"
            aria-label={isGroupEnabled(node) ? 'Desativar' : 'Ativar'}
            onClick={() => useEditor.getState().updateNode(id, { enabled: !isGroupEnabled(node) })}
          >
            {isGroupEnabled(node) ? 'Ativa' : 'Inativa'}
          </button>
        ) : null}
        <button
          type="button"
          className="px-1 text-[11px] text-[#9aa3b2]"
          aria-label={node.visible ? 'Ocultar' : 'Mostrar'}
          onClick={() => useEditor.getState().toggleVisible(id)}
        >
          {node.visible ? 'Ver' : 'Oculto'}
        </button>
      </div>
      {isGroupNode(node)
        ? node.childIds.map((childId) => (
            <OutlinerNode key={childId} id={childId} depth={depth + 1} />
          ))
        : null}
    </div>
  )
}
