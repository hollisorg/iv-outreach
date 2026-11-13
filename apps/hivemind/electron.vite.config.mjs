import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  main: {
    build: { outDir: resolve(root, 'out/main'), rollupOptions: { input: { index: resolve(root, 'main/index.js'), mcp: resolve(root, 'mcp/server.js') } } },
  },
  preload: {
    build: {
      outDir: resolve(root, 'out/preload'),
      rollupOptions: { input: { index: resolve(root, 'preload/index.js') }, output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    root: resolve(root, 'renderer'),
    plugins: [react()],
    build: { outDir: resolve(root, 'out/renderer'), rollupOptions: { input: resolve(root, 'renderer/index.html') } },
  },
})
