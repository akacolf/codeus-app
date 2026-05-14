# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

QC Codium is Quantum Club's pre-alpha agentic IDE — an Electron desktop app that pairs a Monaco editor with an in-app agent panel. Positioned alongside T3 Code / Codex but with a full IDE surface. The codebase is currently a thin shell: real agent execution, IPC streaming, and IDE features are not yet wired.

Repo: `github.com/atomicfield/qc-codium` (private). Working tree lives at `~/Desktop/qc-codium` (was originally scaffolded at `~/projects/qc-codium` and relocated).

## Stack & package manager

- **Electron 39** (main / preload / renderer split) + `electron-vite` build orchestrator
- **React 19 + TypeScript 5.9**, Vite 7
- **Tailwind v4** via `@tailwindcss/vite` — `@import "tailwindcss"` + `@import "tw-animate-css"` in `src/renderer/src/assets/main.css`. Two-layer token system: `@theme inline` maps Tailwind utility colors to CSS vars, and `:root` defines those vars. shadcn names (`--background`, `--foreground`, `--primary`, `--card`, `--muted`, etc.) are the canonical token set.
- **shadcn/ui** (New York style, neutral base) — primitives copied into `src/renderer/src/components/ui/`. `cn()` lives in `@renderer/lib/utils`. `components.json` is at repo root; aliases use the `@renderer/*` namespace.
- **Monaco** via `@monaco-editor/react` (workers load from CDN by default — switch to bundled workers before shipping offline)
- **lucide-react** for icons (shadcn's default; never bring in a second icon set).
- **Bun** is the package manager. Always use `bun install` / `bun run …`, never npm. `bun.lock` is the source of truth.
- **electron-builder** for packaging (`electron-builder.yml`, `build/` is `buildResources`)

## Commands

```bash
bun install              # install deps (runs electron-builder install-app-deps via postinstall)
bun run dev              # electron-vite dev — launches Electron with HMR
bun run typecheck        # runs typecheck:node + typecheck:web (two tsconfigs)
bun run lint             # eslint --cache .
bun run format           # prettier --write .
bun run build            # typecheck + electron-vite build (output: out/)
bun run build:mac        # build + electron-builder --mac (skips typecheck on purpose)
bun run build:win        # full typecheck + package for Windows
bun run build:linux      # full typecheck + package for Linux
bun run build:unpack     # build + electron-builder --dir (unpacked, fast smoke test)
```

No test runner is configured yet.

## Architecture

Three independently-built bundles, defined in `electron.vite.config.ts`:

- **`src/main/`** — Electron main process. `index.ts` creates the `BrowserWindow` (1400×900, `hiddenInset` traffic lights on macOS, pure `#000000` background, frameless-feeling chrome via `autoHideMenuBar` + custom drag region). Loads `ELECTRON_RENDERER_URL` in dev, `../renderer/index.html` in prod. Only an `ipcMain.on('ping')` stub exists today. **Splash is rendered in-app by the renderer**, not as a separate window — do not reintroduce a standalone splash BrowserWindow.
- **`src/preload/`** — Context-isolated bridge. Exposes `window.electron` (from `@electron-toolkit/preload`) and an empty `window.api` placeholder. Extend `api` here and mirror the type in `index.d.ts` when adding IPC surface.
- **`src/renderer/src/`** — React app. `@renderer` alias points here. `App.tsx` mounts `<Splash />` as an overlay (z-50, fades out after ~1.4s) over the IDE layout: a draggable header strip + CSS-grid split (`1fr 360px`) of `<Editor />` and `<AgentPanel />`. The agent panel is a **stub** — it fakes replies; there is no model client wired through IPC yet.

### Key invariants when extending

- **Three TypeScript projects, three tsconfigs:** `tsconfig.node.json` covers main + preload, `tsconfig.web.json` covers renderer. `tsconfig.json` is a references root but also carries `compilerOptions.paths` for tooling (shadcn CLI reads it). `bun run typecheck` runs both; CI parity requires both to pass.
- **Agent / model code belongs in main, not renderer.** API keys must not sit in the renderer bundle. When wiring a real agent: SDK in main → expose a typed `api` surface in preload → renderer calls via `window.api` → stream back over IPC.
- **Tokens, not raw hex.** Use the shadcn token names (`bg-background`, `text-foreground`, `bg-card`, `bg-primary`, `text-muted-foreground`, etc.). Add new tokens by extending `:root` + `@theme inline` in `main.css` — don't hardcode hex in components.
- **Black & white theme, no outline borders.** Hard product rule: the palette is strict grayscale (no accent hue), and components must not render visible border lines. `--border` is set to `transparent`; a base layer also forces `border-color: transparent` on every element. When `bunx shadcn@latest add` pulls a new primitive, **immediately review the generated file** and strip `border`, `border-input`, and `aria-invalid:border-destructive` classes from cva variants. For dividers (Separator, ScrollArea thumb) use `bg-white/8` to `bg-white/20` — a subtle gray bar, never a border line.
- **Splash is in-renderer, not a second window.** `<Splash />` in `App.tsx` overlays the IDE on first render and fades out. Don't reintroduce a separate splash BrowserWindow in `main/index.ts` — that pattern was tried and rejected.
- **Window chrome:** the top 32px strip in `App.tsx` is the drag region (no native title bar on macOS). Don't put interactive elements there without `WebkitAppRegion: 'no-drag'`. The splash overlay is itself draggable.

### Adding shadcn components

```bash
bunx --bun shadcn@latest add <name> [--yes --overwrite]
```

Components land in `src/renderer/src/components/ui/`. After install, audit for border classes and remove them per the rule above. The CLI uses `components.json` at the repo root and resolves `@renderer/*` via root `tsconfig.json` paths.

## In-flight work / known follow-ups

- **Monaco workers** load from CDN today (default `@monaco-editor/react` behavior). Switch to Vite-bundled workers before any offline/production push.
- **Agent panel is a stub** — `components/AgentPanel.tsx` fakes replies. To make it real: AI SDK in main process (API keys never in renderer) → typed surface on `window.api` via preload → stream over IPC.
- **No test runner yet** — when one is needed, ask the user before picking (Vitest is the natural fit given Vite).

## Branding & icons

- `resources/logo.svg` is the canonical mark (rounded black square with `<>`).
- `build/icon.png` is what electron-builder rasterizes into `.icns` / `.ico` / Linux sizes. `resources/icon.png` is also referenced as the Linux runtime window icon (`src/main/index.ts:4`). Keep both in sync (currently byte-identical 1024×1024 PNGs); regenerate from `logo.svg` when the mark changes.
- App identity is set in `electron-builder.yml`: `appId: club.quantum.qccodium`, `productName: QC Codium`.

## Git conventions

- Commits are authored as `akacolf <98905290+akacolf@users.noreply.github.com>` (set in this repo's local git config).
- **No `Co-Authored-By: Claude …` trailer** — the user has explicitly opted out.
- Remote: `https://github.com/atomicfield/qc-codium` (private).
