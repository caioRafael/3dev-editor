interface PanelHeaderProps {
  title: string
  children?: React.ReactNode
}

export function PanelHeader({ title, children }: PanelHeaderProps): React.JSX.Element {
  return (
    <header className="flex h-8 shrink-0 items-center gap-2 border-b border-[#2c3240] px-3 text-[11px] font-medium text-[#9aa3b2]">
      <span className="shrink-0">{title}</span>
      {children ? <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div> : null}
    </header>
  )
}
