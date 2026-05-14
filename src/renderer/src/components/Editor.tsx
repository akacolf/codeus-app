import { useState } from 'react'
import MonacoEditor from '@monaco-editor/react'
import { Separator } from '@renderer/components/ui/separator'

const STARTER = `// Welcome to QC Codium
// Quantum Club's agentic IDE — pre-alpha scaffold.
//
// Try editing this file, then ask the agent on the right
// to do something with it.

export function greet(name: string): string {
  return \`Hello, \${name} — welcome to QC Codium.\`
}

console.log(greet('builder'))
`

export function Editor(): React.JSX.Element {
  const [value, setValue] = useState<string>(STARTER)

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-3 px-3 text-xs text-muted-foreground">
        <span className="text-foreground">welcome.ts</span>
        <span className="text-[10px] tracking-wider uppercase">typescript</span>
      </div>
      <Separator />
      <div className="min-h-0 flex-1">
        <MonacoEditor
          height="100%"
          defaultLanguage="typescript"
          theme="vs-dark"
          value={value}
          onChange={(v) => setValue(v ?? '')}
          options={{
            fontSize: 13,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            renderLineHighlight: 'all',
            tabSize: 2,
            wordWrap: 'on'
          }}
        />
      </div>
    </div>
  )
}
