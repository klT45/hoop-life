import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 纯静态输出，可直接丢到任意静态托管 / GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0 },
  server: { port: 5173, open: false },
})
