import { useEffect, useState } from 'react'
import type { RecentProject } from '../../../shared/api'
import { readEditorApi } from './editorApi'
import { createProject, openProjectFile, openRecentProjectFile } from './projectActions'

export function WelcomeModal({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element | null {
  const [projects, setProjects] = useState<RecentProject[]>([])
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeSession, setNoticeSession] = useState(open)
  if (open !== noticeSession) {
    setNoticeSession(open)
    if (open) setNotice('')
  }

  useEffect(() => {
    if (!open) return
    const api = readEditorApi()
    if (!api) return
    let cancelled = false
    void api.listRecentProjects().then((listed) => {
      if (!cancelled) setProjects(listed)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  async function run(action: () => Promise<{ ok: boolean; message: string }>): Promise<void> {
    setNotice('')
    setPending(true)
    const result = await action()
    setPending(false)
    if (result.ok) {
      onClose()
      return
    }
    if (result.message) setNotice(result.message)
    const api = readEditorApi()
    if (api) setProjects(await api.listRecentProjects())
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#14161b]/80 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="flex max-h-full w-[28rem] flex-col gap-4 rounded-lg border border-[#2c3240] bg-[#1b1e27] p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
      >
        <div>
          <h1 id="welcome-title" className="text-[18px] font-semibold text-[#f3f5f8]">
            3dev
          </h1>
          <p className="mt-1 text-[13px] text-[#9aa3b2]">Crie um projeto ou abra um existente.</p>
        </div>
        <div className="flex gap-2">
          <ModalButton
            label="Criar projeto"
            disabled={pending}
            onClick={() => void run(createProject)}
          />
          <ModalButton
            label="Abrir outro"
            disabled={pending}
            onClick={() => void run(openProjectFile)}
          />
        </div>
        <div className="min-h-0">
          <p className="px-1 text-[12px] tracking-wide text-[#9aa3b2] uppercase">
            Projetos recentes
          </p>
          {projects.length === 0 ? (
            <p className="px-1 py-3 text-[12px] text-[#8b93a3]">Nenhum projeto recente.</p>
          ) : (
            <ul className="mt-1 max-h-48 overflow-auto">
              {projects.map((project) => (
                <li key={project.jsonPath}>
                  <button
                    type="button"
                    className="block w-full truncate rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-[#2a3040] disabled:opacity-50"
                    title={project.jsonPath}
                    disabled={pending}
                    onClick={() => void run(() => openRecentProjectFile(project.jsonPath))}
                  >
                    {project.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {notice ? <p className="text-[12px] text-[#e7b3a2]">{notice}</p> : null}
        <div className="flex justify-end">
          <ModalButton label="Fechar" disabled={pending} onClick={onClose} />
        </div>
      </div>
    </div>
  )
}

function ModalButton({
  label,
  disabled,
  onClick
}: {
  label: string
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="rounded-md border border-[#2c3240] px-3 py-1.5 text-[13px] text-[#e7e9ee] hover:bg-[#2a3040] disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
