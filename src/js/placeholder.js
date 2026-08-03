/* ============================================================
   MISSING ART
   A trip should be buildable before its artwork exists. Rather
   than a broken-image icon or an invisible gap, anything that
   fails to load is replaced by a hatched box naming the file —
   so opening the page tells you exactly what's still missing.

   The placeholder is a data URI, so it needs no asset of its own
   and can't itself 404.
   ============================================================ */

const HATCH = '#B5533C'

export function placeholderURI(label, w = 480, h = 320){
  const font = Math.max(11, Math.min(w, h) * 0.055)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
      `<defs><pattern id="h" width="14" height="14" patternUnits="userSpaceOnUse" ` +
        `patternTransform="rotate(45)">` +
        `<line x1="0" y1="0" x2="0" y2="14" stroke="${HATCH}" stroke-width="4" opacity=".28"/>` +
      `</pattern></defs>` +
      `<rect width="${w}" height="${h}" fill="#1E222B"/>` +
      `<rect width="${w}" height="${h}" fill="url(#h)"/>` +
      `<rect x="1" y="1" width="${w-2}" height="${h-2}" fill="none" ` +
        `stroke="${HATCH}" stroke-width="2" stroke-dasharray="8 6"/>` +
      `<text x="50%" y="50%" fill="#F5F0E6" font-family="ui-monospace,monospace" ` +
        `font-size="${font}" text-anchor="middle" dominant-baseline="middle">` +
        `${esc(label)}</text>` +
    `</svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

const esc = s => String(s).replace(/[<>&]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;' }[c]))

/* Swap in a placeholder if the file 404s. Once only — a placeholder that
   itself failed would loop. */
export function onMissing(img, label){
  if(!img) return img
  img.addEventListener('error', () => {
    const w = Math.round(img.clientWidth) || 480
    const h = Math.round(img.clientHeight) || Math.round(w * 0.66)
    img.src = placeholderURI(label ?? img.getAttribute('src') ?? 'missing', w, h)
    img.classList.add('is-missing')
    console.warn(`[final-call] missing asset: ${label ?? img.getAttribute('src')}`)
  }, { once: true })
  return img
}

/* every <img> under `root` that hasn't already been wired */
export function watchImages(root, labelFor){
  root?.querySelectorAll?.('img:not([data-ph])').forEach(img => {
    img.dataset.ph = '1'
    onMissing(img, labelFor?.(img))
  })
}

/* A pin that will do until the real one arrives: the same three classes the
   real artwork needs, so hover states keep working. */
export const FALLBACK_PIN =
  '<svg viewBox="0 0 44 52" xmlns="http://www.w3.org/2000/svg">' +
    '<g class="pin-panel">' +
      `<path class="pin-inner" d="M4 4h36v34H26l-4 10-4-10H4z" fill="${HATCH}" ` +
        'stroke="#F5F0E6" stroke-width="2" stroke-dasharray="5 4"/>' +
    '</g>' +
    '<text class="pin-badge" x="22" y="24" fill="#F5F0E6" font-family="ui-monospace,monospace" ' +
      'font-size="15" text-anchor="middle" dominant-baseline="middle">?</text>' +
  '</svg>'
