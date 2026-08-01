/* Resolve runtime paths against Vite's configured base, so the build works
   at a domain root or in any subfolder. Use for anything referenced by a
   string at runtime (sprites, pins, JSON) rather than imported as a module. */
const BASE = import.meta.env.BASE_URL

export const asset = p => BASE + String(p).replace(/^\//, '')
