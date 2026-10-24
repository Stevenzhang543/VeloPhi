/** Vite and Vitest configuration. */
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// Relative base so the same build runs from a web server, from file:// (portable package) and in Tauri
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  clearScreen: false,
  server: { port: 5178, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', chunkSizeWarningLimit: 2500 },
  // The solver worker (src/worker/sim.worker.ts) is an ES module worker that shares chunks with the app
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 120000 }
})
