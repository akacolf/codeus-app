import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [
      // React Compiler (stable v1) auto-memoizes components/hooks so the
      // streaming chat surface doesn't re-render the whole thread on every
      // assistant delta. Targets React 19 by default — no config needed.
      react({ babel: { plugins: ['babel-plugin-react-compiler'] } }),
      tailwindcss()
    ]
  }
})
