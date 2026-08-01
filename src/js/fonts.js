import { tripAsset } from './data.js'

/* ============================================================
   FONTS

   Declared per trip rather than globally, so a visitor only ever
   downloads the faces the trip they're looking at actually uses.
   Ten trips with ten different pairings still cost two downloads.

   Two sources are supported per face:
     google : a Google Fonts family+axis string
     src    : a self-hosted file under public/

   Each face also carries a `fallback` stack. Combined with
   font-display:swap that means text is readable immediately and
   then swaps, rather than sitting invisible while a file loads.
   ============================================================ */

const injected = new Set()

function injectGoogle(spec){
  const href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`
  if(injected.has(href)) return
  injected.add(href)

  /* preconnect once — it saves a DNS + TLS round trip on the font request */
  if(!injected.has('preconnect')){
    injected.add('preconnect')
    for(const [host, cors] of [['https://fonts.googleapis.com', false],
                               ['https://fonts.gstatic.com', true]]){
      const l = document.createElement('link')
      l.rel = 'preconnect'; l.href = host
      if(cors) l.crossOrigin = 'anonymous'
      document.head.appendChild(l)
    }
  }

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

function injectLocal(family, src, weight = '400', style = 'normal'){
  const key = `${family}|${src}`
  if(injected.has(key)) return
  injected.add(key)

  const url = tripAsset(src)
  const fmt = /\.woff2?$/.test(src) ? 'woff2'
            : /\.otf$/.test(src)    ? 'opentype'
            : 'truetype'

  const style_ = document.createElement('style')
  style_.textContent = `@font-face{
    font-family:'${family}';
    src:url('${url}') format('${fmt}');
    font-weight:${weight};
    font-style:${style};
    font-display:swap;
  }`
  document.head.appendChild(style_)
}

/* `role` is the CSS variable the face binds to: display | sans */
export function loadFonts(fonts){
  if(!fonts) return

  for(const [role, f] of Object.entries(fonts)){
    if(!f?.family) continue

    if(f.google) injectGoogle(f.google)
    if(f.src)    injectLocal(f.family, f.src, f.weight, f.style)

    const stack = [`'${f.family}'`, f.fallback].filter(Boolean).join(',')
    document.documentElement.style.setProperty(`--${role}`, stack)
  }
}
