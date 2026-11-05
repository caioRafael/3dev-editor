import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useEditor } from '../document/store'
import { useFunctionTip } from './functionTips'

export function FunctionTip(): React.JSX.Element | null {
  const tool = useEditor((state) => state.tool)
  const current = useFunctionTip((state) => state.current)
  const dismissedId = useFunctionTip((state) => state.dismissedId)

  useEffect(() => {
    useFunctionTip.getState().syncTool(tool)
  }, [tool])

  if (dismissedId === current.id) return null

  return (
    <aside
      aria-label="Explicação da função"
      className="pointer-events-auto w-72 rounded-md border border-[#2c3240] bg-[#1b1e27]/95 px-3 py-2 text-[12px] text-[#e7e9ee] shadow-lg"
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 font-medium">{current.title}</p>
        <button
          type="button"
          aria-label="Fechar explicação"
          className="shrink-0 rounded p-0.5 text-[#9aa3b2] hover:bg-[#2a3040] hover:text-[#e7e9ee]"
          onClick={() => useFunctionTip.getState().dismiss()}
        >
          <X size={14} />
        </button>
      </div>
      <p className="mt-1 text-[#b7beca]">{current.body}</p>
    </aside>
  )
}
