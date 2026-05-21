# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

QC Codeus is Quantum Club's research-preview agentic IDE — an Electron desktop app with a chat-first home (Codex-style composer) and a Claude-style slide-in sidebar. QC is an AI & research company, so framing is "research preview" not "alpha/beta". Positioned alongside T3 Code / Codex but aiming at a full IDE surface. The chat surface, an in-app `node-pty` terminal, and a Monaco-backed editor pane (file tree + tabs + Cmd+S save via project-scoped `fs:*` IPC) are all wired.

Repo: `github.com/atomicfield/qc-codeus` (private; renamed from `qc-codium` on 2026-05-20 — GitHub auto-redirects the old URL). Working tree lives at `~/Desktop/qc-codeus` (was originally scaffolded at `~/projects/qc-codium`, relocated to `~/Desktop/qc-codium`, and renamed to `~/Desktop/qc-codeus` alongside the product rename).

## Stack & package manager

- **Electron 39** (main / preload / renderer split) + `electron-vite` build orchestrator
- **React 19 + TypeScript 5.9**, Vite 7
- **Tailwind v4** via `@tailwindcss/vite` — `@import "tailwindcss"` + `@import "tw-animate-css"` in `src/renderer/src/assets/main.css`. Two-layer token system: `@theme inline` maps Tailwind utility colors to CSS vars, and `:root` defines those vars. shadcn names (`--background`, `--foreground`, `--primary`, `--card`, `--muted`, etc.) are the canonical token set.
- **shadcn/ui** (New York style, neutral base) — primitives copied into `src/renderer/src/components/ui/`. `cn()` lives in `@renderer/lib/utils`. `components.json` is at repo root; aliases use the `@renderer/*` namespace.
- **lucide-react** for icons (shadcn's default; never bring in a second icon set).
- **Zustand 5** for renderer state. The chat surface lives in `src/renderer/src/stores/chatStore.ts` (history-stack navigation, chat CRUD, streaming wiring). New state should join this store rather than spawn parallel context providers; persistence is handled inside the store via a `subscribe` selector.
- **Zod 4** is the schema/validation library — use it for IPC payload validation, settings parsing, and any user-input boundaries. Don't hand-roll type guards when Zod can express the schema.
- `@monaco-editor/react` is installed but **not currently imported** — Monaco was the original editor surface and will return when the IDE pane is rebuilt. Don't remove the dep without checking in.
- **Bun** is the package manager. Always use `bun install` / `bun run …`, never npm. `bun.lock` is the source of truth.
- **electron-builder** for packaging (`electron-builder.yml`, `build/` is `buildResources`)
- **Production proxy lives in the `quantum-club-website` repo** at `src/app/api/codeus/v1/chat/completions/route.ts`, deployed to Vercel and served at `https://api.quantumclub.sh/v1` (via a host-scoped `vercel.json` rewrite). It forwards to **Vercel AI Gateway** (`https://ai-gateway.vercel.sh/v1`) using `AI_GATEWAY_API_KEY` — new orgs get $5 of free credits every 30 days, zero markup. `QC_MOCK_UPSTREAM=true` (Vercel env) streams a canned reply so the pipeline can be exercised without spending credits.
- **`proxy/`** in this repo is a duplicate Bun/Vercel workspace kept for optional standalone local dev; the website's `npm run dev` serves the same route at `http://localhost:3000/api/codeus/v1`, so the workspace is no longer required.

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

- **`src/main/`** — Electron main process. `index.ts` creates the `BrowserWindow` (default 1400×900, `hiddenInset` traffic lights on macOS, pure `#000000` background, frameless-feeling chrome via `autoHideMenuBar` + custom drag region). Window size/position/maximized/fullscreen are persisted to `app.getPath('userData')/window-state.json` and restored on launch (debounced saves on resize/move/maximize/close; saved positions are discarded if no attached display still contains them). Hosts `chat.ts` (streaming to the proxy at `api.quantumclub.sh/v1` which authenticates server-side and uses its own AI Gateway key — **the renderer never sees credentials and there is no BYO-key UI**) and `terminal.ts` (`node-pty` sessions). Loads `ELECTRON_RENDERER_URL` in dev, `../renderer/index.html` in prod. **Splash is rendered in-app by the renderer**, not as a separate window — do not reintroduce a standalone splash BrowserWindow.
- **`src/preload/`** — Context-isolated bridge. Exposes `window.electron` (from `@electron-toolkit/preload`) and a typed `window.api` surface (`api.chat.start`, `api.terminal.*`, `openTerminal`, `revealInFolder`, `projectCwd`, `onChromeState`). Extend `api` here; the `Api` type is inferred and consumed by the renderer through `src/preload/index.d.ts`.
- **`src/renderer/src/`** — React app. `@renderer` alias points here. `App.tsx` is the shell:
  - `<Toolbar />` — 40px header strip. Draggable empty space + non-draggable chrome buttons (sidebar toggle, back, forward, new chat, terminal, reveal, settings) inset by `pl-[88px]` to clear the macOS traffic lights at `{x:14,y:14}`.
  - `<Home />` — the chat-first welcome screen: centered "What are we building, Colf?" heading, rounded composer with permissions/model pills, project/branch strip, and a list of suggestion rows separated by `bg-white/8` dividers. Submissions flow through `useChatStore.sendMessage` and start a streamed assistant reply.
  - `<Thread />` — rendered when `view.type === 'chat'`; streams assistant deltas from the store.
  - `<Sidebar />` — Claude-style slide-in panel (absolute, `w-72`, slides on `translate-x`). Backdrop click + `Escape` close it. Renders the QC mark, nav (New chat, Search chats), then **two top-level sections in order: `Projects` (collapsible groups, one per `projectCwd`) above `Chats` (flat list of ungrouped chats)**. The string "No folder" is retired — the ungrouped bucket renders as its own `Chats` section header (`MessageSquare` icon), not as a folder. Per-row hover actions (Rename inline / Delete via `DropdownMenu`).
  - `<SearchChatsDialog />` — Cmd-K palette over the chat list; `showCloseButton={false}` (intentional — Escape/backdrop close it).
  - `<TerminalPanel />` — bottom-anchored `xterm.js` panel with a tab strip, backed by main-process `node-pty` sessions. **Resizable from a 2px drag handle on the top edge** (cursor `row-resize`, drag clamps between `MIN_HEIGHT=120` and `window.innerHeight - 80`, double-click resets to default, height persisted to `localStorage['qc-codeus.terminal.height.v2']`). Header has a `Maximize2/Minimize2` fullscreen toggle beside the close button — fullscreen mode expands to the full clamp without overwriting the saved drag height.
  - `<Splash />` — z-50 overlay that fades out after ~1.4s on first mount.

### Key invariants when extending

- **Three TypeScript projects, three tsconfigs:** `tsconfig.node.json` covers main + preload, `tsconfig.web.json` covers renderer. Both run with `noEmit: true` (no `composite`, no `baseUrl` — `paths` use leading `./`). `tsconfig.json` is a `files: []` root carrying `compilerOptions.paths` for tooling (shadcn CLI reads it). `bun run typecheck` runs both; CI parity requires both to pass.
- **Agent / model code belongs in main, not renderer.** API keys must not sit in the renderer bundle, and the product does not surface a bring-your-own-key flow — QC Codeus provides the upstream service. The renderer calls `window.api.chat.start`; the main process forwards to the production proxy at `api.quantumclub.sh/v1` which holds the AI Gateway key. When swapping providers, keep the secret on the main/proxy side; do not reintroduce a `safeStorage`-backed user key field in Settings.
- **Renderer state lives in the Zustand store, not in component context.** `useChatStore` is the source of truth for chats, navigation history, and streaming. Component-local state is fine for ephemeral UI (open/closed dialogs, hover state, draft text); persisted or cross-component state goes through the store. `subscribeWithSelector` is enabled so `useChatStore.subscribe(selector, listener)` can drive side effects (the chat-list persistence subscription is the canonical example).
- **Tokens, not raw hex.** Use the shadcn token names (`bg-background`, `text-foreground`, `bg-card`, `bg-primary`, `text-muted-foreground`, etc.). Add new tokens by extending `:root` + `@theme inline` in `main.css` — don't hardcode hex in components.
- **Black & white theme, no outline borders.** Hard product rule: the palette is strict grayscale (no accent hue), and components must not render visible border lines. `--border` is set to `transparent`; a base layer also forces `border-color: transparent` on every element. When `bunx shadcn@latest add` pulls a new primitive, **immediately review the generated file** and strip `border`, `border-input`, and `aria-invalid:border-destructive` classes from cva variants. For dividers (Separator, ScrollArea thumb) use `bg-white/8` to `bg-white/20` — a subtle gray bar, never a border line.
- **Splash is in-renderer, not a second window.** `<Splash />` in `App.tsx` overlays the IDE on first render and fades out. Don't reintroduce a separate splash BrowserWindow in `main/index.ts` — that pattern was tried and rejected.
- **Window chrome:** the top 40px strip is the `<Toolbar />` drag region (no native title bar on macOS). Buttons inside it set `WebkitAppRegion: 'no-drag'` individually; the `pl-[88px]` inset reserves space for the macOS traffic lights. The sidebar header also reserves that inset so its close button doesn't sit under the lights. The splash overlay is itself draggable.

### Adding shadcn components

```bash
bunx --bun shadcn@latest add <name> [--yes --overwrite]
```

Components land in `src/renderer/src/components/ui/`. After install, audit for border classes and remove them per the rule above. The CLI uses `components.json` at the repo root and resolves `@renderer/*` via root `tsconfig.json` paths.

## In-flight work / known follow-ups

- **Editor pane is back.** `Workspace.tsx`, `EditorPane.tsx`, and `FileTree.tsx` are wired and rendered for `view.type === 'editor'`. Monaco is the surface. Dirty-state warns on app close (`beforeunload`) and on auto-update restart.
- **No test runner yet** — when one is needed, ask the user before picking (Vitest is the natural fit given Vite + Zustand).
- **Code signing / notarization / auto-update** are not configured in `electron-builder.yml`. CI builds are unsigned; shipping outside `bun run build:unpack` will need this before distribution.
- **CI** lives at `.github/workflows/ci.yml`: a single `check` job (typecheck + lint on Ubuntu) gates a `build` matrix that runs `electron-vite build` on `ubuntu-latest`, `macos-latest`, and `windows-latest`. It does not yet produce signed installers — wire that when release pipelines are needed.

## Branding & icons

- `resources/logo.svg` is the canonical mark (rounded black square with `<>`).
- `build/icon.png` is what electron-builder rasterizes into `.icns` / `.ico` / Linux sizes. `resources/icon.png` is also referenced as the Linux runtime window icon (`src/main/index.ts:4`). Keep both in sync (currently byte-identical 1024×1024 PNGs); regenerate from `logo.svg` when the mark changes.
- App identity is set in `electron-builder.yml`: `appId: club.quantum.qccodeus`, `productName: QC Codeus`, `executableName: qc-codeus`. `setAppUserModelId` in `src/main/index.ts` must stay in sync with `appId`. (Bumping `appId` orphans any previously installed `qccodium` build — fresh install required.)

## Git conventions

- Commits are authored as `akacolf <98905290+akacolf@users.noreply.github.com>` (set in this repo's local git config).
- **No `Co-Authored-By: Claude …` trailer** — the user has explicitly opted out.
- Remote: `https://github.com/atomicfield/qc-codeus` (private).
