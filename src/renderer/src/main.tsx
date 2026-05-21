import './assets/main.css'
import './lib/monaco-setup'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startMcpBridge } from './lib/mcp-bridge'

startMcpBridge()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
