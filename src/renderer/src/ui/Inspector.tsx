import { useState } from 'react'
import { booleanRadiusLimit, localBounds, maxEdgeRadius } from '../document/math'
import { useEditor } from '../document/store'
import {
  type BooleanNode,
  type FeatureNode,
  type Vec3,
  isBooleanNode,
  isCuboidNode,
  isCylinderNode,
  isSphereNode
} from '../document/types'

export function Inspector(): React.JSX.Element {
  const selection = useEditor((state) => state.selection)
  const nodes = useEditor((state) => state.document.nodes)
  const selectedId = selection.at(-1) ?? null
  const node = selectedId ? nodes[selectedId] : undefined

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-[#2c3240] bg-[#1b1e27]">
      <header className="border-b border-[#2c3240] px-3 py-2 text-[12px] tracking-wide text-[#9aa3b2] uppercase">
        Propriedades
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {!node || !selectedId ? (
          <p className="text-[12px] text-[#8b93a3]">
            Selecione um sólido para editar posição, tamanho e cor.
          </p>
        ) : (
          <NodeFields id={selectedId} node={node} count={selection.length} />
        )}
      </div>
    </aside>
  )
}

function NodeFields({
  id,
  node,
  count
}: {
  id: string
  node: FeatureNode
  count: number
}): React.JSX.Element {
  const disabled = node.locked
  return (
    <div className="flex flex-col gap-3 text-[12px]">
      {count > 1 ? (
        <p className="text-[#9aa3b2]">{count} selecionados. Editando o último.</p>
      ) : null}
      <NameField key={node.name} id={id} name={node.name} disabled={disabled} />
      <VectorFields
        label="Posição"
        value={node.transform.position}
        disabled={disabled}
        onCommit={(position) =>
          useEditor
            .getState()
            .updateNode(id, { transform: { position, rotation: node.transform.rotation } })
        }
      />
      <VectorFields
        label="Rotação"
        value={node.transform.rotation}
        disabled={disabled}
        onCommit={(rotation) =>
          useEditor
            .getState()
            .updateNode(id, { transform: { position: node.transform.position, rotation } })
        }
      />
      {isCuboidNode(node) ? (
        <>
          <VectorFields
            label="Tamanho"
            value={node.size}
            disabled={disabled}
            onCommit={(size) => useEditor.getState().updateNode(id, { size })}
          />
          <EdgeControl
            label="Arredondamento"
            value={node.rounding}
            max={maxEdgeRadius(node.size)}
            disabled={disabled}
            onPreview={(rounding) => useEditor.getState().updateNode(id, { rounding }, false)}
            onCommit={(rounding) => useEditor.getState().updateNode(id, { rounding })}
          />
          <EdgeControl
            label="Chanfro"
            value={node.chamfer}
            max={maxEdgeRadius(node.size)}
            disabled={disabled}
            onPreview={(chamfer) => useEditor.getState().updateNode(id, { chamfer }, false)}
            onCommit={(chamfer) => useEditor.getState().updateNode(id, { chamfer })}
          />
        </>
      ) : null}
      {isCylinderNode(node) ? (
        <>
          <NumberField
            label="Altura"
            value={node.height}
            disabled={disabled}
            onCommit={(height) => useEditor.getState().updateNode(id, { height })}
          />
          <NumberField
            label="Diâmetro"
            value={node.diameter}
            disabled={disabled}
            onCommit={(diameter) => useEditor.getState().updateNode(id, { diameter })}
          />
        </>
      ) : null}
      {isSphereNode(node) ? (
        <NumberField
          label="Diâmetro"
          value={node.diameter}
          disabled={disabled}
          onCommit={(diameter) => useEditor.getState().updateNode(id, { diameter })}
        />
      ) : null}
      {isBooleanNode(node) ? <BooleanRounding id={id} node={node} disabled={disabled} /> : null}
      <label className="flex items-center justify-between gap-2">
        Cor
        <input
          type="color"
          disabled={disabled}
          value={node.appearance.color}
          onChange={(event) =>
            useEditor.getState().updateNode(id, {
              appearance: { color: event.target.value, opacity: node.appearance.opacity }
            })
          }
        />
      </label>
      <NumberField
        label="Opacidade"
        value={node.appearance.opacity}
        disabled={disabled}
        onCommit={(opacity) =>
          useEditor.getState().updateNode(id, {
            appearance: { color: node.appearance.color, opacity: Math.min(1, Math.max(0, opacity)) }
          })
        }
      />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={node.locked}
          onChange={(event) =>
            useEditor.getState().updateNode(id, { locked: event.target.checked })
          }
        />
        Travado
      </label>
    </div>
  )
}

function BooleanRounding({
  id,
  node,
  disabled
}: {
  id: string
  node: BooleanNode
  disabled: boolean
}): React.JSX.Element {
  const document = useEditor((state) => state.document)
  const limit = booleanRadiusLimit(localBounds(document, node))
  return (
    <EdgeControl
      label="Arredondamento"
      value={node.rounding}
      max={limit}
      disabled={disabled}
      onPreview={(rounding) => useEditor.getState().updateNode(id, { rounding }, false)}
      onCommit={(rounding) => useEditor.getState().updateNode(id, { rounding })}
    />
  )
}

function NameField({
  id,
  name,
  disabled
}: {
  id: string
  name: string
  disabled: boolean
}): React.JSX.Element {
  const [text, setText] = useState(name)
  return (
    <label className="flex flex-col gap-1">
      Nome
      <input
        className={inputClass}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (text !== name) useEditor.getState().updateNode(id, { name: text })
        }}
      />
    </label>
  )
}

function VectorFields({
  label,
  value,
  disabled,
  onCommit
}: {
  label: string
  value: Vec3
  disabled: boolean
  onCommit: (value: Vec3) => void
}): React.JSX.Element {
  return (
    <fieldset className="flex flex-col gap-1" disabled={disabled}>
      <legend>{label}</legend>
      <div className="grid grid-cols-3 gap-1">
        <NumberField
          label="X"
          value={value.x}
          disabled={disabled}
          onCommit={(x) => onCommit({ ...value, x })}
        />
        <NumberField
          label="Y"
          value={value.y}
          disabled={disabled}
          onCommit={(y) => onCommit({ ...value, y })}
        />
        <NumberField
          label="Z"
          value={value.z}
          disabled={disabled}
          onCommit={(z) => onCommit({ ...value, z })}
        />
      </div>
    </fieldset>
  )
}

function EdgeControl({
  label,
  value,
  max,
  disabled,
  onPreview,
  onCommit
}: {
  label: string
  value: number
  max: number
  disabled: boolean
  onPreview: (value: number) => void
  onCommit: (value: number) => void
}): React.JSX.Element {
  const limit = Math.max(0, max)
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="text-[#8b93a3]">máx. {limit}</span>
      </span>
      <div className="flex items-center gap-2">
        <input
          className="min-w-0 flex-1 accent-[#d97757] disabled:opacity-40"
          type="range"
          aria-label={label}
          min={0}
          max={limit}
          step={0.1}
          value={Math.min(value, limit)}
          disabled={disabled || limit <= 0}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            useEditor.getState().markHistory()
          }}
          onChange={(event) => onPreview(Number(event.target.value))}
          onPointerUp={() => useEditor.getState().sealHistory()}
          onLostPointerCapture={() => useEditor.getState().sealHistory()}
        />
        <EdgeNumber label={label} value={value} disabled={disabled} onCommit={onCommit} />
      </div>
    </div>
  )
}

function EdgeNumber({
  label,
  value,
  disabled,
  onCommit
}: {
  label: string
  value: number
  disabled: boolean
  onCommit: (value: number) => void
}): React.JSX.Element {
  return (
    <EdgeDraft key={value} label={label} value={value} disabled={disabled} onCommit={onCommit} />
  )
}

function EdgeDraft({
  label,
  value,
  disabled,
  onCommit
}: {
  label: string
  value: number
  disabled: boolean
  onCommit: (value: number) => void
}): React.JSX.Element {
  const [text, setText] = useState(String(value))
  return (
    <input
      className={`${inputClass} w-16`}
      aria-label={label}
      value={text}
      disabled={disabled}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        const next = Number(text)
        if (Number.isFinite(next)) onCommit(next)
        else setText(String(value))
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

function NumberField({
  label,
  value,
  disabled,
  onCommit
}: {
  label: string
  value: number
  disabled: boolean
  onCommit: (value: number) => void
}): React.JSX.Element {
  return (
    <NumberDraft key={value} label={label} value={value} disabled={disabled} onCommit={onCommit} />
  )
}

function NumberDraft({
  label,
  value,
  disabled,
  onCommit
}: {
  label: string
  value: number
  disabled: boolean
  onCommit: (value: number) => void
}): React.JSX.Element {
  const [text, setText] = useState(String(value))
  return (
    <label className="flex flex-col gap-1">
      {label}
      <input
        className={inputClass}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const next = Number(text)
          if (Number.isFinite(next)) onCommit(next)
          else setText(String(value))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}

const inputClass =
  'rounded-md border border-[#3a4152] bg-[#12141a] px-2 py-1 text-[#f2f4f8] outline-none focus:border-[#d97757]'
