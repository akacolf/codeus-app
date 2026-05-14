import { Editor } from './components/Editor'
import { AgentPanel } from './components/AgentPanel'

function App(): React.JSX.Element {
  return (
    <div className="flex h-screen w-screen flex-col bg-[var(--color-bg)] text-[var(--color-fg)]">
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-panel)] px-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-wide text-[var(--color-fg)]">QC Codium</span>
          <span className="text-[var(--color-muted)]">·</span>
          <span className="text-[var(--color-muted)]">Quantum Club</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
          pre-alpha
        </span>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[1fr_360px]">
        <Editor />
        <AgentPanel />
      </main>
    </div>
  )
}

export default App
