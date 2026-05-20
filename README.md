# QC Codeus

QC Codeus is **Quantum Club**'s next-gen agentic development platform — an IDE
experience deeply merged with autonomous coding agents. Think of it as the
ground where products like T3 Code or Codex meet a full IDE surface.

> Status: research preview. Electron + Vite + React + TypeScript shell with chat streaming, in-app terminal, and a Monaco-backed editor pane.

## Stack

- Electron (main + preload + renderer)
- Vite (`electron-vite`)
- React 19 + TypeScript
- electron-builder for packaging

## Project Setup

### Install

```bash
bun install
```

### Development

```bash
bun run dev
```

### Build

```bash
# Windows
bun run build:win

# macOS
bun run build:mac

# Linux
bun run build:linux
```

## Layout

```
src/
  main/      # Electron main process
  preload/   # Preload bridge
  renderer/  # React UI (the future IDE surface)
```
