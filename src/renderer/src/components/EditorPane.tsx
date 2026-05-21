import { useEffect, useMemo, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as MonacoNS from 'monaco-editor'
import { isDirty, useWorkspaceStore, type OpenFile } from '@renderer/stores/workspaceStore'

const QC_THEME = 'qc-codeus-dark'

function languageForPath(path: string): string {
  const ext = path.toLowerCase().split('.').pop() ?? ''
  switch (ext) {
    case 'ts':
    case 'mts':
    case 'cts':
      return 'typescript'
    case 'tsx':
      return 'typescript'
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'jsx':
      return 'javascript'
    case 'json':
      return 'json'
    case 'md':
    case 'markdown':
      return 'markdown'
    case 'css':
      return 'css'
    case 'html':
    case 'htm':
      return 'html'
    case 'yaml':
    case 'yml':
      return 'yaml'
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'shell'
    case 'rs':
      return 'rust'
    case 'go':
      return 'go'
    case 'py':
      return 'python'
    default:
      return 'plaintext'
  }
}

interface EditorPaneProps {
  file: OpenFile
}

export function EditorPane({ file }: EditorPaneProps): React.JSX.Element {
  const setBuffer = useWorkspaceStore((s) => s.setBuffer)
  const saveActive = useWorkspaceStore((s) => s.saveActive)
  const pendingReveal = useWorkspaceStore((s) => s.pendingReveal)
  const clearPendingReveal = useWorkspaceStore((s) => s.clearPendingReveal)
  const monacoRef = useRef<typeof MonacoNS | null>(null)
  const editorRef = useRef<MonacoNS.editor.IStandaloneCodeEditor | null>(null)
  const language = useMemo(() => languageForPath(file.path), [file.path])

  // Handle citation reveals. We re-run when `seq` changes so clicking the same
  // citation twice still jumps the cursor.
  useEffect(() => {
    if (!pendingReveal) return
    if (pendingReveal.path !== file.path) return
    const editor = editorRef.current
    if (!editor) return
    const line = Math.max(1, pendingReveal.line | 0)
    editor.revealLineInCenter(line)
    editor.setPosition({ lineNumber: line, column: 1 })
    editor.focus()
    clearPendingReveal(pendingReveal.path, pendingReveal.seq)
  }, [pendingReveal, file.path, clearPendingReveal])

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    monaco.editor.defineTheme(QC_THEME, {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#000000',
        'editor.foreground': '#e6e6e6',
        'editorLineNumber.foreground': '#3a3a3a',
        'editorLineNumber.activeForeground': '#8a8a8a',
        'editorCursor.foreground': '#ffffff',
        'editor.lineHighlightBackground': '#0c0c0c',
        'editor.selectionBackground': '#ffffff22',
        'editor.inactiveSelectionBackground': '#ffffff14',
        'editorGutter.background': '#000000',
        'editorWidget.background': '#0a0a0a',
        'editorWidget.border': '#1a1a1a',
        'editorSuggestWidget.background': '#0a0a0a',
        'editorIndentGuide.background1': '#141414',
        'editorIndentGuide.activeBackground1': '#2a2a2a',
        'scrollbarSlider.background': '#ffffff14',
        'scrollbarSlider.hoverBackground': '#ffffff22',
        'scrollbarSlider.activeBackground': '#ffffff33'
      }
    })
    monaco.editor.setTheme(QC_THEME)

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void saveActive()
    })

    const pushSelection = (): void => {
      const sel = editor.getSelection()
      const model = editor.getModel()
      if (!sel || !model || sel.isEmpty()) {
        void window.api.mcp.updateState({ selection: null })
        return
      }
      void window.api.mcp.updateState({
        selection: {
          path: file.path,
          startLine: sel.startLineNumber,
          startCol: sel.startColumn,
          endLine: sel.endLineNumber,
          endCol: sel.endColumn,
          text: model.getValueInRange(sel)
        }
      })
    }
    editor.onDidChangeCursorSelection(pushSelection)
    pushSelection()
  }

  if (file.error) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Couldn’t open {file.path}: {file.error}
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-0 flex-1">
      <Editor
        value={file.value}
        language={language}
        theme={QC_THEME}
        path={file.path}
        onChange={(value) => setBuffer(file.path, value ?? '')}
        onMount={handleMount}
        options={{
          automaticLayout: true,
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
          fontSize: 13,
          lineHeight: 1.55,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          renderLineHighlight: 'line',
          padding: { top: 12, bottom: 16 },
          guides: { indentation: true },
          tabSize: 2,
          wordWrap: 'off',
          fixedOverflowWidgets: true,
          stickyScroll: { enabled: false }
        }}
      />
      {isDirty(file) && (
        <div className="pointer-events-none absolute right-3 bottom-3 rounded bg-card/80 px-2 py-1 text-[10px] tracking-wide text-muted-foreground uppercase">
          unsaved · ⌘S
        </div>
      )}
    </div>
  )
}
