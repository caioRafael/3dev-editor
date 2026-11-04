import { useState } from 'react'
import { booleanRadiusLimit, localBounds, maxEdgeRadius } from '../document/math'
import { useEditor } from '../document/store'
import {
  type BooleanNode,
  type Extrusion,
  type FeatureNode,
  type Vec2,
  type Vec3,
  isBooleanNode,
  isCircleNode,
  isComponentNode,
  isCuboidNode,
  isCylinderNode,
  isEllipseNode,
  isNgonNode,
  isProfileNode,
  isRectNode,
  isSphereNode,
  isStarNode,
  isSvgNode,
  isTextNode
} from '../document/types'

export function Inspector(): React.JSX.Element {
  const selection = useEditor((state) => state.selection)
  const nodes = useEditor((state) => state.document.files[state.document.activeFile]?.nodes)
  const selectedId = selection.at(-1) ?? null
  const node = selectedId && nodes ? nodes[selectedId] : undefined

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
      {isComponentNode(node) ? (
        <>
          <p className="text-[#9aa3b2]">Componente {node.componentName}</p>
          <VectorFields
            label="Escala"
            value={node.scale}
            disabled={disabled}
            onCommit={(scale) => useEditor.getState().updateNode(id, { scale })}
          />
        </>
      ) : null}
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
      {isRectNode(node) ? (
        <>
          <PairFields
            label="Tamanho"
            value={node.size}
            disabled={disabled}
            onCommit={(size2) => useEditor.getState().updateNode(id, { size2 })}
          />
          <EdgeControl
            label="Arredondamento"
            value={node.rounding}
            max={Math.max(0, Math.min(node.size.x, node.size.y) / 2 - 0.001)}
            disabled={disabled}
            onPreview={(rounding) => useEditor.getState().updateNode(id, { rounding }, false)}
            onCommit={(rounding) => useEditor.getState().updateNode(id, { rounding })}
          />
          <EdgeControl
            label="Chanfro"
            value={node.chamfer}
            max={Math.max(0, Math.min(node.size.x, node.size.y) / 2 - 0.001)}
            disabled={disabled}
            onPreview={(chamfer) => useEditor.getState().updateNode(id, { chamfer }, false)}
            onCommit={(chamfer) => useEditor.getState().updateNode(id, { chamfer })}
          />
        </>
      ) : null}
      {isCircleNode(node) ? (
        <NumberField
          label="Diâmetro"
          value={node.diameter}
          disabled={disabled}
          onCommit={(diameter) => useEditor.getState().updateNode(id, { diameter })}
        />
      ) : null}
      {isEllipseNode(node) ? (
        <PairFields
          label="Diâmetro"
          value={node.diameter}
          disabled={disabled}
          onCommit={(diameter2) => useEditor.getState().updateNode(id, { diameter2 })}
        />
      ) : null}
      {isNgonNode(node) ? (
        <>
          <NumberField
            label="Lados"
            value={node.sides}
            disabled={disabled}
            onCommit={(sides) => useEditor.getState().updateNode(id, { sides })}
          />
          <NumberField
            label="Diâmetro"
            value={node.diameter}
            disabled={disabled}
            onCommit={(diameter) => useEditor.getState().updateNode(id, { diameter })}
          />
          <NumberField
            label="Arredondamento"
            value={node.rounding}
            disabled={disabled}
            onCommit={(rounding) => useEditor.getState().updateNode(id, { rounding })}
          />
        </>
      ) : null}
      {isStarNode(node) ? (
        <>
          <NumberField
            label="Pontas"
            value={node.points}
            disabled={disabled}
            onCommit={(points) => useEditor.getState().updateNode(id, { points })}
          />
          <NumberField
            label="Diâmetro"
            value={node.diameter}
            disabled={disabled}
            onCommit={(diameter) => useEditor.getState().updateNode(id, { diameter })}
          />
          <NumberField
            label="Diâmetro interno"
            value={node.innerDiameter}
            disabled={disabled}
            onCommit={(innerDiameter) => useEditor.getState().updateNode(id, { innerDiameter })}
          />
        </>
      ) : null}
      {isTextNode(node) ? <TextFields id={id} node={node} disabled={disabled} /> : null}
      {isSvgNode(node) ? (
        <NumberField
          label="Escala"
          value={node.importScale}
          disabled={disabled}
          onCommit={(importScale) => useEditor.getState().updateNode(id, { importScale })}
        />
      ) : null}
      {isProfileNode(node) ? (
        <ExtrusionFields id={id} extrusion={node.extrusion} disabled={disabled} />
      ) : null}
      {isTextNode(node) ? (
        <p className="text-[#8b93a3]">
          A prévia rápida usa Liberation Sans. A prévia exata usa a fonte instalada no OpenSCAD.
        </p>
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

function ExtrusionFields({
  id,
  extrusion,
  disabled
}: {
  id: string
  extrusion: Extrusion
  disabled: boolean
}): React.JSX.Element {
  const commit = (patch: Partial<Extrusion>): void => {
    useEditor.getState().updateNode(id, { extrusion: { ...extrusion, ...patch } })
  }
  return (
    <>
      <NumberField
        label="Altura"
        value={extrusion.height}
        disabled={disabled}
        onCommit={(height) => commit({ height })}
      />
      <NumberField
        label="Torção"
        value={extrusion.twist}
        disabled={disabled}
        onCommit={(twist) => commit({ twist })}
      />
      <NumberField
        label="Escala do topo"
        value={extrusion.scale}
        disabled={disabled}
        onCommit={(scale) => commit({ scale })}
      />
    </>
  )
}

function TextFields({
  id,
  node,
  disabled
}: {
  id: string
  node: FeatureNode
  disabled: boolean
}): React.JSX.Element | null {
  if (!isTextNode(node)) return null
  return (
    <>
      <TextInput
        key={node.text}
        label="Texto"
        value={node.text}
        disabled={disabled}
        onCommit={(text) => useEditor.getState().updateNode(id, { text })}
      />
      <NumberField
        label="Tamanho"
        value={node.size}
        disabled={disabled}
        onCommit={(textSize) => useEditor.getState().updateNode(id, { textSize })}
      />
      <TextInput
        key={node.font}
        label="Fonte"
        value={node.font}
        disabled={disabled}
        onCommit={(font) => useEditor.getState().updateNode(id, { font })}
      />
      <ChoiceField
        label="Horizontal"
        value={node.halign}
        disabled={disabled}
        options={[
          { value: 'left', label: 'Esquerda' },
          { value: 'center', label: 'Centro' },
          { value: 'right', label: 'Direita' }
        ]}
        onCommit={(halign) => useEditor.getState().updateNode(id, { halign })}
      />
      <ChoiceField
        label="Vertical"
        value={node.valign}
        disabled={disabled}
        options={[
          { value: 'top', label: 'Topo' },
          { value: 'center', label: 'Centro' },
          { value: 'baseline', label: 'Base' },
          { value: 'bottom', label: 'Fundo' }
        ]}
        onCommit={(valign) => useEditor.getState().updateNode(id, { valign })}
      />
    </>
  )
}

function PairFields({
  label,
  value,
  disabled,
  onCommit
}: {
  label: string
  value: Vec2
  disabled: boolean
  onCommit: (value: Vec2) => void
}): React.JSX.Element {
  return (
    <fieldset className="flex flex-col gap-1" disabled={disabled}>
      <legend>{label}</legend>
      <div className="grid grid-cols-2 gap-1">
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
      </div>
    </fieldset>
  )
}

function TextInput({
  label,
  value,
  disabled,
  onCommit
}: {
  label: string
  value: string
  disabled: boolean
  onCommit: (value: string) => void
}): React.JSX.Element {
  const [text, setText] = useState(value)
  return (
    <label className="flex flex-col gap-1">
      {label}
      <input
        className={inputClass}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (text !== value) onCommit(text)
        }}
      />
    </label>
  )
}

function ChoiceField<T extends string>({
  label,
  value,
  options,
  disabled,
  onCommit
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  disabled: boolean
  onCommit: (value: T) => void
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      {label}
      <select
        className={inputClass}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = options.find((option) => option.value === event.target.value)
          if (next) onCommit(next.value)
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
