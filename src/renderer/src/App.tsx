import { useState } from 'react'
import { Editor } from './components/Editor'
import { AgentPanel } from './components/AgentPanel'
import { Splash } from './components/Splash'
import { Separator } from '@renderer/components/ui/separator'

function App(): React.JSX.Element {
  const [booting, setBooting] = useState(true)

  return (
    <div className="relative flex h-screen w-screen flex-col bg-background text-foreground">
      <div className="h-8 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      <main className="grid min-h-0 flex-1 grid-cols-[1fr_360px]">
        <Editor />
        <div className="flex h-full">
          <Separator orientation="vertical" />
          <div className="min-w-0 flex-1">
            <AgentPanel />
          </div>
        </div>
      </main>

      {booting && <Splash onDone={() => setBooting(false)} />}
    </div>
  )
}

export default App
