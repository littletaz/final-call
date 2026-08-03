import { TRIP, tripAsset } from './data.js'
import { onMissing, watchImages, FALLBACK_PIN } from './placeholder.js'

/* ============================================================
   MAP
   Base map (with optional per-itinerary variant), inset, waves,
   clouds, and POI pins.

   Two coordinate spaces live here, deliberately:

     waves + pins  features OF the map. x/y are fractions of the
                   map image, so they sit on real geography and
                   are calibratable.

     clouds        weather OVER the scene. x/y are percentages of
                   the VIEWPORT, so they keep drifting across a
                   2560px screen instead of being trapped inside
                   the 1920px map frame. Their SIZE still tracks
                   the map, via a CSS variable.
   ============================================================ */

/* One dial for every sprite. 1 = exactly as exported, relative to the map. */
const SPRITE_SCALE = 1

export const MapView = {
  el: {},
  pinSvg: '',

  async init(){
    this.el.world  = document.getElementById('world')
    this.el.base   = document.getElementById('basemap')
    onMissing(this.el.base, TRIP.data.map.base || 'map.png')
    this.el.alt    = document.getElementById('basemap-alt')
    this.el.inset  = document.getElementById('inset')
    this.el.clouds = document.getElementById('clouds')
    this.el.waves  = document.getElementById('waves')
    this.el.pois   = document.getElementById('pois')

    const d = TRIP.data
    this.el.base.src = tripAsset(d.map.base)
    this.el.base.dataset.src = tripAsset(d.map.base)
    const logo = document.querySelector('#logo img')
    onMissing(logo, d.map.logo || 'logo.png')
    logo.src = tripAsset(d.map.logo || 'logo.png')

    if(d.map.backgroundColor)
      document.documentElement.style.setProperty('--sea', d.map.backgroundColor)

    this.el.world.style.aspectRatio =
      `${d.map.baseSize.w}/${d.map.baseSize.h * this.visible()}`
    this.syncRatio()

    /* the pin is a per-trip asset, not baked into this file, so a new trip can
       ship its own geometry without a code change */
    await this.loadPin()

    this.renderClouds()
    this.renderWaves()
    this.renderInset()
  },

  async loadPin(){
    const path = TRIP.data.map.pin || 'pin.svg'
    try {
      const res = await fetch(tripAsset(path))
      if(!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = await res.text()
      this.pinSvg = raw.replace(/<\?xml[^>]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').trim()
      if(!/class="pin-panel"/.test(this.pinSvg))
        console.warn(`[final-call] ${path} has no .pin-panel — hover states won't work. ` +
                     `A pin needs .pin-badge, .pin-panel and .pin-inner.`)
    } catch(e){
      /* A trip can be built before its pin is drawn — the fallback carries the
         same three classes, so hover states keep working and the page tells you
         what's missing instead of showing nothing. */
      console.warn(`[final-call] missing asset: ${path} — using the fallback pin`)
      this.pinSvg = FALLBACK_PIN
    }
  },

  /* `cropBottom` hides empty space at the base of the artwork without
     re-exporting. Coordinates stay fractions of the FULL image, so a crop
     never invalidates a calibration — they're scaled on the way out.

     On narrow screens the crop is dropped: the map is already small there, and
     the dataviz that the cleared space existed for is hidden anyway. */
  isNarrow(){ return window.matchMedia('(max-width: 860px)').matches },
  visible(){ return this.isNarrow() ? 1 : 1 - (TRIP.data.map.cropBottom ?? 0) },
  yPct(v){ return v / this.visible() * 100 },

  /* the crop changes at the breakpoint, so anything positioned against it has
     to be recomputed when we cross it */
  watchBreakpoint(onChange){
    const mq = window.matchMedia('(max-width: 860px)')
    const handler = () => {
      const { naturalWidth:w, naturalHeight:h } = this.el.base
      if(w && h) this.el.world.style.aspectRatio = `${w}/${h * this.visible()}`
      this.renderWaves()
      this.placeInset()
      onChange?.()
    }
    mq.addEventListener ? mq.addEventListener('change', handler) : mq.addListener(handler)
  },

  syncRatio(){
    const img = this.el.base
    const apply = () => {
      const { naturalWidth:w, naturalHeight:h } = img
      if(!w || !h) return
      this.el.world.style.aspectRatio = `${w}/${h * this.visible()}`
      document.documentElement.style.setProperty('--map-natural-w', w)

      const dec = TRIP.data.map.baseSize
      if(dec && (dec.w !== w || dec.h !== h))
        console.warn(`[final-call] map.baseSize says ${dec.w}x${dec.h} but the image is ` +
                     `${w}x${h}. Layout self-corrected, but pin coordinates are fractions ` +
                     `of the image — run "npm run remap".`)
    }
    img.complete ? apply() : img.addEventListener('load', apply, { once:true })
  },

  /* ---- two sizing models, on purpose --------------------------------------
     'map'   width is a fraction of the map's rendered width, so the sprite
             shrinks with the map on smaller screens. One CSS calc against
             --map-w, no resize listener.

     'fixed' width is the exported pixel size divided by `divisor`, held
             constant at every viewport. Right for assets exported at 2x for a
             3840 canvas: divisor 2 renders them at their intended size and
             keeps them there rather than shrinking below 1920.
     -------------------------------------------------------------------- */
  sizeSprite(img, { mode = 'map', scale = 1, divisor = 2 } = {}){
    const apply = () => {
      if(!img.naturalWidth) return
      /* NOT parentElement: waves nest an extra .wave-bob for the animation, so
         the image's parent isn't the sized box. Clouds don't. */
      const wrap = img.closest('.sprite')
      if(!wrap) return
      if(mode === 'fixed'){
        wrap.style.width = (img.naturalWidth / divisor * scale * SPRITE_SCALE) + 'px'
      } else {
        const mapW = this.el.base.naturalWidth || TRIP.data.map.baseSize?.w
        if(!mapW) return
        wrap.style.setProperty(
          '--sprite-ratio', (img.naturalWidth / mapW * scale * SPRITE_SCALE).toFixed(5))
      }
    }
    const ready = () => img.complete && (mode === 'fixed' || this.el.base.complete)
    if(ready()) apply()
    else {
      img.addEventListener('load', apply, { once:true })
      if(mode !== 'fixed') this.el.base.addEventListener('load', apply, { once:true })
    }
  },

  renderClouds(){
    const clouds = TRIP.data.map.clouds ?? []
    /* negative delays scatter them across the sky on load rather than letting
       them all enter from the left together */
    this.el.clouds.innerHTML = clouds.map((c, i) => `
      <div class="cloud-track" style="
           animation-duration:${c.dur}s;
           animation-delay:-${(c.dur * ((i * 0.137) % 1)).toFixed(1)}s;
           --travel:${c.travel}%">
        <div class="sprite" style="left:${c.x}%;top:${c.y}%">
          <img src="${tripAsset(c.file)}" alt="">
        </div>
      </div>`).join('')

    watchImages(this.el.clouds, img => img.getAttribute('src')?.split('/').pop())
    clouds.forEach((c, i) =>
      this.sizeSprite(this.el.clouds.querySelectorAll('img')[i],
                      { mode:'map', scale:c.scale ?? 1 }))
  },

  /* Waves are placed on the map like pins — a map with no water simply has none. */
  renderWaves(){
    const waves = TRIP.data.map.waves ?? []
    this.el.waves.innerHTML = waves.map((w, i) => `
      <div class="sprite" data-wave="${i}"
           style="left:${(w.x * 100).toFixed(3)}%;top:${this.yPct(w.y).toFixed(3)}%">
        <div class="wave-bob" style="
             animation-duration:${w.dur ?? 6}s;--dy:${w.dy ?? 14}px;--dx:${w.dx ?? 0}px">
          <img src="${tripAsset(w.file)}" alt="">
        </div>
      </div>`).join('')

    /* Sized against the MAP, not in fixed pixels: a wave is part of the
       scene, so it has to keep its proportion to the coastline it sits
       beside at every viewport. */
    watchImages(this.el.waves, img => img.getAttribute('src')?.split('/').pop())
    const ws = TRIP.data.map.waveScale ?? 1
    waves.forEach((w, i) =>
      this.sizeSprite(this.el.waves.querySelectorAll('img')[i],
                      { mode:'map', scale:(w.scale ?? 1) * ws }))
  },

  renderInset(){
    const ins = TRIP.data.map.inset
    if(!ins){ this.el.inset.hidden = true; return }
    this.el.inset.innerHTML = `<img src="${tripAsset(ins.src)}" alt="${ins.id} inset map">`
    onMissing(this.el.inset.querySelector('img'), ins.src)
    this.placeInset()
  },

  placeInset(){
    const ins = TRIP.data.map.inset
    if(!ins) return
    Object.assign(this.el.inset.style, {
      top:   this.yPct(ins.y).toFixed(3) + '%',
      width: (ins.w * 100) + '%',
    })
  },

  /* An itinerary may point at different artwork of the same dimensions — a
     recolour, say. Two images are stacked and crossfaded so the swap doesn't
     flash through the background. */
  setVariant(itinerary){
    const url = tripAsset(itinerary?.map?.base ?? TRIP.data.map.base)
    if(this.el.base.dataset.src === url) return

    this.el.alt.src = url
    const reveal = () => {
      this.el.alt.classList.add('is-shown')
      /* once faded in, promote it so the next swap crossfades from here */
      setTimeout(() => {
        this.el.base.src = url
        this.el.base.dataset.src = url
        this.el.alt.classList.remove('is-shown')
      }, 420)
    }
    this.el.alt.complete ? reveal() : this.el.alt.addEventListener('load', reveal, { once:true })
  },

  /* called on selector hover, so switching feels instant */
  preloadVariant(itinerary){
    const want = itinerary?.map?.base
    if(!want) return
    new Image().src = tripAsset(want)
  },

  /* Numbered from the stop's position in the ACTIVE itinerary, so reordering
     or switching variant renumbers them automatically. */
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
      btn.style.top  = (c.onInset ? c.y * 100 : this.yPct(c.y)).toFixed(3) + '%'
      btn.setAttribute('aria-label', num ? `${num}. ${loc.name.en}` : loc.name.en)
      btn.innerHTML = this.pinSvg +
        `<span class="poi-num">${num ?? ''}</span>` +
        `<span class="tip">${loc.name.en}</span>`
      btn.addEventListener('click', e => onSelect(loc.id, e))

      const onInset = c.onInset && ins && c.onInset === ins.id
      ;(onInset ? this.el.inset : this.el.pois).appendChild(btn)
    }
  },
}
