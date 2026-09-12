import { TRIP, tripAsset } from './data.js'
import { onMissing, watchImages, FALLBACK_PIN } from './placeholder.js'
import { NARROW_MQ, WIDE_MQ, isNarrow, MAP_FULL_WIDTH, MAP_NARROW_WIDTH } from './breakpoints.js'

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
  pinSvgByType: null,

  async init(){
    this.el.stage  = document.getElementById('stage')
    this.el.frame  = document.getElementById('frame')
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
    /* #logo was the map-frame title image in v1; v2's Hero (src/js/hero.js)
       renders the title as real text instead, so a trip without a #logo
       element in the shell just skips this — not an error. */
    const logo = document.querySelector('#logo img')
    if(logo){
      onMissing(logo, d.map.logo || 'logo.png')
      logo.src = tripAsset(d.map.logo || 'logo.png')
    }

    if(d.map.backgroundColor){
      const root = document.documentElement.style
      root.setProperty('--sea', d.map.backgroundColor)
      /* the same colour at zero alpha, for the map's edge fade — see
         #stage.has-map-crop::after in main.css */
      root.setProperty('--sea-fade', d.map.backgroundColor + '00')
    }

    this.el.world.style.aspectRatio =
      `${d.map.baseSize.w}/${d.map.baseSize.h * this.visible()}`
    this.syncRatio()
    this.applyMapMetrics()

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

      /* A trip can ship one pin.svg with several <svg data-pin-type="…">
         blocks — basecamp/stay/daytrip — so a stop's marker varies with
         trip.json's stops[].stopType (see this trip's own pin.svg comment
         and pinMarkupFor() below). A trip with no data-pin-type at all
         (the older one-shape convention) just uses the whole file for
         every type, same as before. */
      const typed = [...new DOMParser()
        .parseFromString(this.pinSvg, 'text/html')
        .querySelectorAll('svg[data-pin-type]')]
      this.pinSvgByType = typed.length
        ? Object.fromEntries(typed.map(el => [el.dataset.pinType, el.outerHTML]))
        : null

      if(!this.pinSvgByType && !/class="pin-panel"/.test(this.pinSvg))
        console.warn(`[final-call] ${path} has no .pin-panel — hover states won't work. ` +
                     `A pin needs .pin-badge, .pin-panel and .pin-inner (or data-pin-type variants).`)
    } catch(e){
      /* A trip can be built before its pin is drawn — the fallback carries the
         same three classes, so hover states keep working and the page tells you
         what's missing instead of showing nothing. */
      console.warn(`[final-call] missing asset: ${path} — using the fallback pin`)
      this.pinSvg = FALLBACK_PIN
      this.pinSvgByType = null
    }
  },

  /* Resolves a stop's marker to actual SVG markup — the type-specific
     variant if this trip's pin.svg has one, else the trip's single shared
     shape (the convention every other trip still uses). */
  pinMarkupFor(stopType){
    if(!this.pinSvgByType) return this.pinSvg
    return this.pinSvgByType[stopType] ?? this.pinSvgByType.stay ?? this.pinSvg
  },

  /* `cropBottom` hides empty space at the base of the artwork without
     re-exporting. Coordinates stay fractions of the FULL image, so a crop
     never invalidates a calibration — they're scaled on the way out.

     On narrow screens the crop is dropped: the map is already small there, and
     the dataviz that the cleared space existed for is hidden anyway. */
  isNarrow(){ return isNarrow() },
  visible(){ return this.isNarrow() ? 1 : 1 - (TRIP.data.map.cropBottom ?? 0) },
  yPct(v){ return v / this.visible() * 100 },

  /* ---- how big the map is, and where ---------------------------------------
     map.contentSize/contentOffset: a trip's map.png is exported on a BIGGER
     canvas than its Figma mockup crop (deliberately, so a wider screen has
     room to reveal more without a re-export — see australia-2027's
     trip.json). contentSize is that mockup crop's own box inside the bigger
     canvas; contentOffset is where it starts.

     Reading Figma's five breakpoint frames (node 169:2327) together, the
     rule they all obey is a single one:

       render the artwork at a FIXED pixel width and centre it on ONE point
       of the base image — contentOffset.x + contentSize.w/2, the middle of
       the mockup's own crop window.

     Measured off the route vector in each frame, that anchor lands on the
     viewport centre at 375, 768, 1200, 1440, 2156 and 3820 alike, and
     contentOffset.y places the window's top edge on the artwork the same
     way. Every desktop frame masks the map with the SAME 1908x1120 window
     over the same part of the image — Figma puts it 674px right and 160px
     down inside the placed art at 1200, 1440, 2156 and 3820 — so the whole
     desktop ladder is one window and only the viewport around it changes.
     What varies is just:

       scale   1:1 from 768px up — the artwork does NOT grow or shrink with
               the viewport, the viewport just reveals more or less of it.
               Below 768 it shrinks to map.narrowScale at 375 (Figma draws
               the art 1180px wide there, not 2238).
       window  dropped entirely on mobile, which shows the whole image
               instead: the 768 and 375 frames have no mask at all.

     That replaces the old %-of-#frame zoom, which was only ever right at
     exactly 1440: #frame is width:100% below --artboard, so the crop window
     shrank with the viewport and the map zoomed OUT instead of cropping.

     A trip with no contentSize (japon-2026) keeps the original model —
     #world in flow at 100% of the 1440-capped #frame — which is what the
     .has-map-crop class on #stage switches between. */
  mapScale(){
    const s = TRIP.data.map.narrowScale
    const w = window.innerWidth
    if(!s || w >= MAP_FULL_WIDTH) return 1
    return s + (1 - s) * (w - MAP_NARROW_WIDTH) / (MAP_FULL_WIDTH - MAP_NARROW_WIDTH)
  },

  applyMapMetrics(){
    const d  = TRIP.data.map
    const cs = d.contentSize
    this.el.stage.classList.toggle('has-map-crop', !!cs)
    if(!cs) return

    const scale   = this.mapScale()
    const narrow  = this.isNarrow()
    const anchorX = (d.contentOffset?.x ?? 0) + cs.w / 2

    /* Two numbers place the artwork behind the window: the anchor puts
       base-image x on the viewport's centre line, and contentOffset.y puts
       base-image y on the window's top edge. Desktop's band height and the
       window's place in it are layout, not trip data, so they live in
       main.css; --map-band-h is only consulted on mobile, where the window
       is dropped and the whole image is shown instead. */
    const s = this.el.stage.style
    s.setProperty('--map-render-w', (d.baseSize.w * scale) + 'px')
    s.setProperty('--map-anchor-x', (anchorX     * scale) + 'px')
    s.setProperty('--map-content-y', narrow ? '0px'
                                            : ((d.contentOffset?.y ?? 0) * scale) + 'px')
    s.setProperty('--map-band-h',   (d.baseSize.h * this.visible() * scale) + 'px')
  },

  /* The scale is a function of viewport width below 768, and the band
     height changes at the breakpoint — so both are recomputed on resize,
     not just when the breakpoint is crossed. One rAF-coalesced write of
     three custom properties; everything positioned against the map (pins,
     route, inset, waves) is a fraction of #world and follows for free. */
  watchBreakpoint(onChange){
    const crossed = () => {
      const { naturalWidth:w, naturalHeight:h } = this.el.base
      if(w && h) this.el.world.style.aspectRatio = `${w}/${h * this.visible()}`
      this.applyMapMetrics()
      this.renderWaves()
      this.placeInset()
      onChange?.()
    }
    for(const q of [NARROW_MQ, WIDE_MQ]){
      const mq = window.matchMedia(q)
      mq.addEventListener ? mq.addEventListener('change', crossed) : mq.addListener(crossed)
    }

    let raf
    window.addEventListener('resize', () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => this.applyMapMetrics())
    })
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

  /* Every stop in the active itinerary gets a pin — base stays AND day-trip
     spurs (Blue Mountains, Echo Point/Three Sisters via the Katoomba pin,
     Hunter Valley, Milford/Doubtful Sound, Mount Cook...). Numbering only
     applies to base stops (their position among OTHER base stops in the
     ACTIVE itinerary, so reordering or switching variant renumbers them
     automatically) — a spur's pin just carries its name, no number, same
     as the dot-pin design already hides .poi-num everywhere (main.css). */
  renderPins(itinerary, onSelect){
    const ins = TRIP.data.map.inset
    const bases = itinerary.stops.filter(s => !s.spur)
    const order = new Map(bases.map((s, i) => [s.locationId, i + 1]))

    this.el.pois.querySelectorAll('.poi').forEach(n => n.remove())
    this.el.inset.querySelectorAll('.poi').forEach(n => n.remove())

    for(const stop of itinerary.stops){
      const loc = TRIP.byId[stop.locationId]
      if(!loc) continue
      const c   = loc.coordinates
      const num = order.get(loc.id)
      /* falls back sanely for trips with no stopType authored — moot for
         them anyway since pinMarkupFor() only branches on it when this
         trip's own pin.svg actually declares type variants. */
      const stopType = stop.stopType || (stop.spur ? 'daytrip' : 'stay')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'poi'
      btn.dataset.locationId = loc.id
      btn.dataset.pinType = stopType
      btn.style.left = (c.x * 100) + '%'
      btn.style.top  = (c.onInset ? c.y * 100 : this.yPct(c.y)).toFixed(3) + '%'
      if(loc.pinColor) btn.style.setProperty('--pin-fill', loc.pinColor)
      btn.setAttribute('aria-label', num ? `${num}. ${loc.name.en}` : loc.name.en)
      btn.innerHTML = this.pinMarkupFor(stopType) +
        `<span class="poi-num">${num ?? ''}</span>` +
        `<span class="tip">${loc.name.en}</span>`
      btn.addEventListener('click', e => onSelect(loc.id, e))

      const onInset = c.onInset && ins && c.onInset === ins.id
      ;(onInset ? this.el.inset : this.el.pois).appendChild(btn)
    }
  },
}
