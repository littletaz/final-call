import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5173, open: true },
  // relative base so the build can be dropped in any subfolder
  base: './',
})
