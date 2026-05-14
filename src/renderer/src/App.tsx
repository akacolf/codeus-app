import { Editor } from './components/Editor'
import { AgentPanel } from './components/AgentPanel'

function App(): React.JSX.Element {
  return (
    <div className="flex h-screen w-screen flex-col bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div
        className="h-8 shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      <main className="grid min-h-0 flex-1 grid-cols-[1fr_360px]">
        <Editor />
        <AgentPanel />
      </main>
    </div>
  )
}

export default App
