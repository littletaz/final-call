import { defineConfig } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  server: { port: 5173, open: true },
  build: {
    /* Built into docs/ rather than dist/, and COMMITTED. GitHub Pages set to
       "Deploy from a branch" serves the repo as-is, so the built output has to
       be in it — the source HTML points at /src/main.js, which only exists
       before a build. Run `npm run build` and commit docs/ before pushing. */
    outDir: 'docs',
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
