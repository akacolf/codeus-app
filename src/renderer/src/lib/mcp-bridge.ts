import { isDirty, useWorkspaceStore } from '@renderer/stores/workspaceStore'

// Pushes IDE state (active file + open tabs) from the workspace store to the
// main-process MCP server so external agents see the same picture as the user.
// Selection updates are pushed separately from the Monaco mount in EditorPane.
export function startMcpBridge(): () => void {
  const push = (): void => {
    const { open, activePath } = useWorkspaceStore.getState()
    void window.api.mcp.updateState({
      activeFile: activePath,
      openTabs: open.map((f) => ({ path: f.path, dirty: isDirty(f) }))
    })
  }

  // Send an initial snapshot so the server reflects current state on first connect.
  push()

  return useWorkspaceStore.subscribe((s) => ({ open: s.open, activePath: s.activePath }), push, {
    equalityFn: (a, b) => {
      if (a.activePath !== b.activePath) return false
      if (a.open.length !== b.open.length) return false
      for (let i = 0; i < a.open.length; i++) {
        const x = a.open[i]
        const y = b.open[i]
        if (x.path !== y.path) return false
        if (isDirty(x) !== isDirty(y)) return false
      }
      return true
    }
  })
}
