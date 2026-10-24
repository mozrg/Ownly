import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5273,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'chrome130',
    assetsInlineLimit: 2048,
    chunkSizeWarningLimit: 1200,
  },
})
