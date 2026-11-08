import { useId, useState } from 'react'
import { validateComponentName } from '../document/files'
import { useEditor } from '../document/store'
import { createNamedComponent } from './projectActions'

export function ComponentNameModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const titleId = useId()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function submit(): void {
    if (pending) return
    const message = validateComponentName(useEditor.getState().document, name)
    if (message) {
      setError(message)
      return
    }
    setPending(true)
    void createNamedComponent(name).then((result) => {
      if (!result.ok) {
        if (result.message) setError(result.message)
        setPending(false)
        return
      }
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0c0e13]/70 p-6">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-lg border border-[#2c3240] bg-[#1b1e27] p-4 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <h2 id={titleId} className="text-[14px] font-medium text-[#f3f5f8]">
          Novo componente
        </h2>
        <p className="mt-1 text-[12px] text-[#9aa3b2]">
          O nome vira o módulo OpenSCAD e o arquivo em code/components.
        </p>
        <label className="mt-3 block text-[12px] text-[#d5d8e0]" htmlFor="component-name">
          Nome
        </label>
        <input
          id="component-name"
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
          className="mt-1 w-full rounded-md border border-[#3a4152] bg-[#14161b] px-2 py-1.5 text-[13px] text-[#e7e9ee] outline-none focus:border-[#d97757]"
        />
        {error ? <p className="mt-2 text-[12px] text-[#e7a394]">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-[12px] text-[#d5d8e0] hover:bg-[#2a3040]"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-[#d97757] px-3 py-1.5 text-[12px] text-[#1c120e] disabled:opacity-60"
          >
            Criar
          </button>
        </div>
      </form>
    </div>
  )
}
