import { app, BrowserWindow, Menu, nativeImage, shell, Tray } from 'electron'
import { readFileSync } from 'fs'
import trayIconTemplate from '../../resources/trayIconTemplate.png?asset'
import trayIconTemplate2x from '../../resources/trayIconTemplate@2x.png?asset'
import trayIcon from '../../resources/trayIcon.png?asset'

export type TrayCommand = 'new-chat' | 'open-terminal' | 'reveal-project'

export interface TrayDeps {
  getWindow: () => BrowserWindow | null
  getProjectCwd: () => string
}

let tray: Tray | null = null
let deps: TrayDeps | null = null

function buildIcon(): Electron.NativeImage {
  if (process.platform === 'darwin') {
    // macOS template image: black-on-transparent at 16px, with the @2x
    // retina representation attached so the menu bar stays crisp on
    // every display. Electron's auto-sibling lookup only works when the
    // file lives next to its @2x companion on disk — under electron-vite
    // `?asset` imports get hashed names so we wire the representation by
    // hand.
    const image = nativeImage.createFromPath(trayIconTemplate)
    try {
      image.addRepresentation({
        scaleFactor: 2.0,
        buffer: readFileSync(trayIconTemplate2x)
      })
    } catch {
      // Missing @2x is non-fatal — the 1x image still renders, just blurry on retina.
    }
    image.setTemplateImage(true)
    return image
  }
  return nativeImage.createFromPath(trayIcon)
}

function showAndFocus(): void {
  const win = deps?.getWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function sendCommand(cmd: TrayCommand): void {
  const win = deps?.getWindow()
  if (!win) return
  showAndFocus()
  win.webContents.send('tray:command', cmd)
}

function buildMenu(): Menu {
  const win = deps?.getWindow()
  const isShowing = !!win && win.isVisible() && !win.isMinimized()
  return Menu.buildFromTemplate([
    { label: 'QC Codeus', enabled: false },
    { type: 'separator' },
    {
      label: isShowing ? 'Hide QC Codeus' : 'Show QC Codeus',
      click: () => {
        const w = deps?.getWindow()
        if (!w) return
        if (w.isVisible() && w.isFocused()) w.hide()
        else showAndFocus()
      }
    },
    { type: 'separator' },
    { label: 'New chat', click: () => sendCommand('new-chat') },
    { label: 'Open terminal', click: () => sendCommand('open-terminal') },
    {
      label: 'Reveal project in Finder',
      click: () => {
        if (deps) void shell.openPath(deps.getProjectCwd())
      }
    },
    { type: 'separator' },
    { label: 'Quit QC Codeus', click: () => app.quit() }
  ])
}

function refreshMenu(): void {
  if (!tray) return
  tray.setContextMenu(buildMenu())
}

export function createTray(initial: TrayDeps): void {
  if (tray) return
  deps = initial
  tray = new Tray(buildIcon())
  tray.setToolTip('QC Codeus')
  refreshMenu()
  // Refresh the visibility label every time the menu is about to open so
  // "Show/Hide" stays accurate without us subscribing to every window event.
  tray.on('mouse-enter', refreshMenu)
  tray.on('right-click', refreshMenu)
}

export function destroyTray(): void {
  if (!tray) return
  tray.destroy()
  tray = null
}

export function setTrayEnabled(enabled: boolean, initial: TrayDeps): void {
  if (enabled) createTray(initial)
  else destroyTray()
}
