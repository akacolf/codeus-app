import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { I18nProvider } from './lib/i18n'
import { startMcpBridge } from './lib/mcp-bridge'

const PRELOAD_RECOVERY_KEY = 'qc-codeus.preload-recovered'

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  if (window.sessionStorage.getItem(PRELOAD_RECOVERY_KEY) === '1') {
    console.error('Failed to preload an app chunk after reload.', event)
    return
  }
  window.sessionStorage.setItem(PRELOAD_RECOVERY_KEY, '1')
  window.location.reload()
})

startMcpBridge()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>
)
