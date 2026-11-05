import { useEffect, useMemo, useState } from 'react'
import { generateOpenscad } from '../codegen/openscad'
import { useEditor } from '../document/store'
import { CodePanel } from './CodePanel'
import { FileTree } from './FileTree'
import { Inspector } from './Inspector'
import { MenuBar } from './MenuBar'
import { Outliner } from './Outliner'
import { StatusBar } from './StatusBar'
import { Toolbar } from './Toolbar'
import { WelcomeModal } from './WelcomeModal'
import { Viewport } from '../viewport/Viewport'

export function AppShell(): React.JSX.Element {
  const document = useEditor((state) => state.document)
  const source = useMemo(() => generateOpenscad(document), [document])
  const [welcomeOpen, setWelcomeOpen] = useState(true)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (welcomeOpen) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setWelcomeOpen(false)
        }
        return
      }
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
  }, [welcomeOpen])

  return (
    <div className="flex h-full w-full flex-col bg-[#14161b] text-[#e7e9ee]">
      <MenuBar onNew={() => setWelcomeOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-[#2c3240] bg-[#1b1e27]">
          <Outliner />
          <FileTree />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <Toolbar />
          <div className="relative z-0 min-h-0 flex-1">
            <Viewport />
          </div>
          <CodePanel source={source} />
        </div>
        <Inspector />
      </div>
      <StatusBar />
      <WelcomeModal open={welcomeOpen} onClose={() => setWelcomeOpen(false)} />
    </div>
  )
}
