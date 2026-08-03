import { defineConfig } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  server: { port: 5173, open: true },
  build: {
    /* dist/, gitignored. The build happens in GitHub Actions and is published
       straight to Pages, so nothing built ever enters the repo — which is why
       there's no duplicate copy of public/ to keep in sync.
       The workflow uploads this exact path; if you change it, change
       .github/workflows/deploy.yml too. */
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // index.html is the LANDING, so the site root opens it. A trip lives at
      // trip.html and is chosen with ?trip=<id> — see public/trips/index.json.
      input: {
        landing: resolve(__dirname, 'index.html'),
        trip:    resolve(__dirname, 'trip.html'),
        no:      resolve(__dirname, 'no.html'),
      },
    },
  },
  // relative base so the build can be dropped in any subfolder
  base: './',
})
