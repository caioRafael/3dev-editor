import { useEffect, useMemo } from 'react'
import { generateOpenscad } from '../codegen/openscad'
import { useEditor } from '../document/store'
import { CodePanel } from './CodePanel'
import { Inspector } from './Inspector'
import { MenuBar } from './MenuBar'
import { Outliner } from './Outliner'
import { StatusBar } from './StatusBar'
import { Toolbar } from './Toolbar'
import { Viewport } from '../viewport/Viewport'

export function AppShell(): React.JSX.Element {
  const document = useEditor((state) => state.document)
  const source = useMemo(() => generateOpenscad(document), [document])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, .monaco-editor, .monaco-hover, .monaco-editor-hover')
      ) {
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) useEditor.getState().redo()
        else useEditor.getState().undo()
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        useEditor.getState().removeSelected()
      } else if (event.key === 'Escape') {
        useEditor.getState().select(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex h-full w-full flex-col bg-[#14161b] text-[#e7e9ee]">
      <MenuBar source={source} />
      <div className="flex min-h-0 flex-1">
        <Outliner />
        <Toolbar />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <Viewport source={source} />
          </div>
          <CodePanel source={source} />
        </div>
        <Inspector />
      </div>
      <StatusBar />
    </div>
  )
}
