import { useEffect, useMemo, useRef } from 'react'
import '@renderer/lib/monaco-setup'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as MonacoNS from 'monaco-editor'
import { getSettings, useSettings } from '@renderer/lib/settings'
import { isDirty, useWorkspaceStore, type OpenFile } from '@renderer/stores/workspaceStore'

const QC_THEME = 'codeus-app-dark'

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
  const pendingReview = useWorkspaceStore((s) => s.pendingReview)
  const clearPendingReveal = useWorkspaceStore((s) => s.clearPendingReveal)
  const clearPendingReview = useWorkspaceStore((s) => s.clearPendingReview)
  const { settings } = useSettings()
  const monacoRef = useRef<typeof MonacoNS | null>(null)
  const editorRef = useRef<MonacoNS.editor.IStandaloneCodeEditor | null>(null)
  const reviewDecorationsRef = useRef<string[]>([])
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

  useEffect(() => {
    if (!pendingReview) return
    if (pendingReview.path !== file.path) return
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel()
    if (!editor || !monaco || !model) return

    const clampLine = (line: number): number =>
      Math.min(Math.max(1, line | 0), model.getLineCount())
    const decorations: MonacoNS.editor.IModelDeltaDecoration[] = [
      ...pendingReview.addedRanges.map((range) => ({
        range: new monaco.Range(clampLine(range.startLine), 1, clampLine(range.endLine), 1),
        options: {
          isWholeLine: true,
          className: 'qc-review-line-added',
          linesDecorationsClassName: 'qc-review-gutter-added',
          overviewRuler: {
            color: '#39d98a',
            position: monaco.editor.OverviewRulerLane.Left
          }
        }
      })),
      ...pendingReview.removedRanges.map((range) => ({
        range: new monaco.Range(clampLine(range.startLine), 1, clampLine(range.endLine), 1),
        options: {
          isWholeLine: true,
          className: 'qc-review-line-removed',
          linesDecorationsClassName: 'qc-review-gutter-removed',
          overviewRuler: {
            color: '#ff5c5c',
            position: monaco.editor.OverviewRulerLane.Left
          }
        }
      }))
    ]

    reviewDecorationsRef.current = editor.deltaDecorations(
      reviewDecorationsRef.current,
      decorations
    )
    const first =
      pendingReview.addedRanges[0]?.startLine ?? pendingReview.removedRanges[0]?.startLine ?? 1
    editor.revealLineInCenter(clampLine(first))
    editor.setPosition({ lineNumber: clampLine(first), column: 1 })
    editor.focus()
    clearPendingReview(pendingReview.path, pendingReview.seq)
  }, [pendingReview, file.path, clearPendingReview])

  useEffect(() => {
    return () => {
      const editor = editorRef.current
      if (!editor) return
      reviewDecorationsRef.current = editor.deltaDecorations(reviewDecorationsRef.current, [])
    }
  }, [file.path])

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
      if (getSettings().editorFormatOnSave) {
        // Best-effort: only fires if a formatter is registered for the
        // language. Monaco swallows the run if none is, so we don't gate on it.
        void editor.getAction('editor.action.formatDocument')?.run()
      }
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
          fontSize: settings.editorFontSize,
          lineHeight: 1.55,
          minimap: { enabled: settings.editorMinimap },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          renderLineHighlight: 'line',
          padding: { top: 12, bottom: 16 },
          guides: { indentation: true },
          tabSize: settings.editorTabSize,
          wordWrap: settings.editorWordWrap ? 'on' : 'off',
          lineNumbers: settings.editorLineNumbers,
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
