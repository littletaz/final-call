import { TRIP } from './data.js'
import { asset } from './paths.js'

/* ============================================================
   MAP
   Base map, Hong Kong inset, drifting cloud/wave sprites, and
   POI pins generated from a single shared pin design.
   ============================================================ */

/* Cloud scatter. x is a % of the map width; negative starts off-stage left.
   x + travel must clear the right edge so the wrap is never visible. Each
   cloud rides its own full-width track, so translateX percentages resolve
   against the map rather than the viewport and behave identically at any
   screen size. Varied durations give the layers different speeds. */
const CLOUDS = [
  { file:'01.png', x:-18, y:25.5, w:15.0, dur:118, travel:140 },
  { file:'02.png', x:-10, y:18.5, w:7.4,  dur:96,  travel:126 },
  { file:'03.png', x:-24, y:41.0, w:8.5,  dur:104, travel:142 },
  { file:'04.png', x:-13, y:15.0, w:8.5,  dur:132, travel:130 },
  { file:'05.png', x:-20, y:29.0, w:11.5, dur:110, travel:136 },
  { file:'06.png', x:-28, y:47.0, w:15.3, dur:142, travel:148 },
  { file:'07.png', x:-15, y:56.0, w:10.4, dur:100, travel:130 },
  { file:'08.png', x:-18, y:62.0, w:10.4, dur:124, travel:134 },
]

/* Waves bob vertically and drift a little sideways. Amplitudes are larger
   than they look — at this scale a 6px bob was invisible. */
const WAVES = [
  { file:'wave-0001.png', x:13.0, y:66.0, w:7.8, dur:6.5, dy:18, dx:10 },
  { file:'wave-0002.png', x:30.0, y:19.0, w:4.4, dur:5.0, dy:13, dx:-7 },
  { file:'wave-0003.png', x:19.5, y:24.0, w:5.2, dur:5.8, dy:15, dx:8 },
  { file:'wave-0004.png', x:57.5, y:74.0, w:4.4, dur:5.3, dy:13, dx:-9 },
  { file:'wave-0005.png', x:69.0, y:70.0, w:5.0, dur:6.1, dy:16, dx:7 },
  { file:'wave-0006.png', x:84.5, y:56.0, w:7.6, dur:6.9, dy:19, dx:-11 },
  { file:'wave-0007.png', x:24.5, y:33.0, w:3.8, dur:4.8, dy:12, dx:6 },
]

export const MapView = {
  el: {},

  init(){
    this.el.world  = document.getElementById('world')
    this.el.base   = document.getElementById('basemap')
    this.el.inset  = document.getElementById('inset')
    this.el.clouds = document.getElementById('clouds')
    this.el.waves  = document.getElementById('waves')
    this.el.pois   = document.getElementById('pois')

    const d = TRIP.data
    this.el.base.src = asset(d.map.base)
    document.querySelector('#logo img').src = asset('assets/logo.png')

    /* Per-trip surround colour, so it can't drift from the colour baked into
       the map artwork. Falls back to the token for older trip files. */
    if(d.map.backgroundColor)
      document.documentElement.style.setProperty('--sea', d.map.backgroundColor)

    /* one canonical canvas ratio per project — the artwork carries its own
       margin, so nothing needs cropping or letterboxing */
    this.el.world.style.aspectRatio = `${d.map.baseSize.w}/${d.map.baseSize.h}`

    this.renderSprites()
    this.renderInset()
  },

  renderSprites(){
    /* negative delays scatter the clouds across the sky on load rather than
       letting them all enter from the left as a pack */
    this.el.clouds.innerHTML = CLOUDS.map((c, i) => `
      <div class="cloud-track" style="
           animation-duration:${c.dur}s;
           animation-delay:-${(c.dur * ((i * 0.137) % 1)).toFixed(1)}s;
           --travel:${c.travel}%">
        <div class="sprite" style="left:${c.x}%;top:${c.y}%;width:${c.w}%">
          <img src="${asset('assets/cloud/' + c.file)}" alt="">
        </div>
      </div>`).join('')

    this.el.waves.innerHTML = WAVES.map(w => `
      <div class="sprite" style="left:${w.x}%;top:${w.y}%;width:${w.w}%">
        <div class="wave-bob" style="
             animation-duration:${w.dur}s;--dy:${w.dy}px;--dx:${w.dx}px">
          <img src="${asset('assets/wave/' + w.file)}" alt="">
        </div>
      </div>`).join('')
  },

  renderInset(){
    const ins = TRIP.data.map.inset
    if(!ins){ this.el.inset.hidden = true; return }
    this.el.inset.innerHTML = `<img src="${asset(ins.src)}" alt="${ins.id} inset map">`
    this.placeInset()
  },

  /* `left` is deliberately NOT set here — the inset is pinned to grid column 1
     by CSS. Writing it inline was overriding that. Only vertical position and
     width remain data-driven. */
  placeInset(){
    const ins = TRIP.data.map.inset
    if(!ins) return
    Object.assign(this.el.inset.style, {
      top:   (ins.y * 100) + '%',
      width: (ins.w * 100) + '%',
    })
  },

  /* Pins are generated from one shared shape; the number comes from the
     stop's position in the ACTIVE itinerary, so reordering or switching
     variants renumbers them automatically. Locations not in the itinerary
     dim and lose their number, so the map reads as a constant world with a
     changing route drawn on it. */
  renderPins(itinerary, onSelect){
    const ins = TRIP.data.map.inset
    const order = new Map(itinerary.stops.map((s, i) => [s.locationId, i + 1]))

    this.el.pois.querySelectorAll('.poi').forEach(n => n.remove())
    this.el.inset.querySelectorAll('.poi').forEach(n => n.remove())

    for(const loc of TRIP.data.locations){
      const c   = loc.coordinates
      const num = order.get(loc.id)
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'poi' + (num ? '' : ' is-inactive')
      btn.dataset.locationId = loc.id
      btn.style.left = (c.x * 100) + '%'
      btn.style.top  = (c.y * 100) + '%'
      btn.setAttribute('aria-label', num ? `${num}. ${loc.name.en}` : loc.name.en)
      btn.innerHTML =
        `<img class="poi-shape" src="${asset('assets/poi/pin.svg')}" alt="">` +
        `<span class="poi-num">${num ?? ''}</span>` +
        `<span class="tip">${loc.name.en}</span>`
      btn.addEventListener('click', e => onSelect(loc.id, e))

      /* pins flagged onInset are positioned relative to the inset box */
      const onInset = c.onInset && ins && c.onInset === ins.id
      ;(onInset ? this.el.inset : this.el.pois).appendChild(btn)
    }
  },
}
