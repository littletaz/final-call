import './styles/tokens.css'
import './styles/grid.css'
import './styles/main.css'
import './styles/pitch.css'
import './styles/hero.css'
import './styles/map-extras.css'
import './styles/highlights.css'
import './styles/weather.css'
import './styles/budget.css'
import './styles/timeline.css'
import './styles/itinerary.css'
/* the split-flap board the Final Call panel is built from — dropped from
   this page when the widget was removed in 89c0684, so the tiles rendered
   as plain text until it came back */
import './styles/flapboard.css'
import './styles/finalcall.css'

import { TRIP, tripAsset, loadData } from './js/data.js'
import { MapView } from './js/map.js'
import { Cards } from './js/cards.js'
import { PoiCard } from './js/poicard.js'
import { Footer } from './js/footer.js'
import { Pitch } from './js/pitch.js'
import { Hero } from './js/hero.js'
import { Boot } from './js/boot.js'
import { FinalCall } from './js/finalcall.js'
import { MapExtras } from './js/mapExtras.js'
import { Highlights } from './js/highlights.js'
import { Weather } from './js/weather.js'
import { Timeline } from './js/timeline.js'
import { loadFonts } from './js/fonts.js'
import { scrollToEl } from './js/scroll.js'

/* ============================================================
   APP
   One `active` itinerary drives the pins, the dataviz and the
   card stack.
   ============================================================ */
let active = null

/* The selector's frames are a trip's own art direction, so they live in its
   folder and are named in its data. A trip that doesn't supply them gets a flat
   plate instead — see --sel-panel-img in styles/main.css. */
/* Standard document-flow scroll (final-call-v1-vs-v2-spec.md §9: "one scroll
   model") — no sticky stack, so the grain just needs to cover the map +
   highlights band and stop before the flow sections below (pitch/footer),
   which carry their own backgrounds. */
function sizeTexture(){
  const tex = document.getElementById('texture')
  if(!tex) return
  const highlights = document.getElementById('highlights')
  const bounds = (highlights && !highlights.hidden) ? highlights : document.getElementById('stage')
  if(!bounds){ tex.style.height = ''; return }

  const bottom = Math.max(0, Math.round(bounds.getBoundingClientRect().bottom + window.scrollY))
  tex.style.height = bottom + 'px'
}

/* The hero/map overlap used to be computed here, as a proportion of the
   hero's measured height, because the hero's height was fluid. Both halves
   are fixed px now — see hero.css for the hero and MapView.applyMapMetrics
   for the map band — so the overlap is a plain negative margin on #stage,
   in main.css, with no measuring and no resize listener. */

let texRaf
function scheduleTexture(){
  cancelAnimationFrame(texRaf)
  texRaf = requestAnimationFrame(() => {
    sizeTexture()
    /* the lower stickers hang off sections whose tops just moved */
    Hero.placeStickers()
  })
}

/* The page grid, straight from the trip's own data (grid.columns/margin/
   gutter, read off the Figma frame's layoutGrids — see trip.json). Written
   as *-base custom properties rather than the real ones, because an inline
   style on :root would beat the media queries in tokens.css that step the
   column count down to 8 and then 4. The margin is stored in artboard px
   and published as vw, so it scales the way the mockup's does. */
/* The page grid, from the trip's own Figma layout grid (trip.json `grid`).
   Two margin models, because the two trips are drawn differently:

   - `minMargin` present — a FIXED content column, centred, never tighter
     than that margin. australia-2027's frames all draw one 1200px column
     (Météo spans 120-1320 at 1440, 478-1678 at 2156, 0-1200 at 1200), so
     the margin is whatever is left over.
   - `minMargin` absent — the old proportional margin, a percentage of the
     artboard. japon-2026 keeps it; nothing has been measured against a
     fixed column there. */
function applyGrid(g){
  if(!g) return
  const root = document.documentElement.style
  if(g.columns) root.setProperty('--grid-cols-base', g.columns)
  if(g.gutter != null) root.setProperty('--grid-gutter-base', g.gutter + 'px')
  if(g.margin == null || !g.artboard) return
  const content = g.contentWidth ?? (g.artboard - 2 * g.margin)
  root.setProperty('--grid-margin-base', g.minMargin != null
    ? `max(${g.minMargin}px, calc((100vw - ${content}px) / 2))`
    : `${g.margin / g.artboard * 100}vw`)
}

function applyUiArt(ui){
  const root = document.documentElement
  /* ABSOLUTE, not relative. A relative url() inside a custom property is
     resolved against the STYLESHEET that uses it, not the document — and the
     built CSS lives in /assets/, so "./trips/…" became "/assets/trips/…" and
     404'd. It works in dev only because the CSS is served from the root there.
     Resolving against document.baseURI removes the ambiguity entirely. */
  const abs = file => new URL(tripAsset(file), document.baseURI).href
  const set = (prop, file) =>
    root.style.setProperty(prop, file ? `url('${abs(file)}')` : 'none')
  /* Declared art that never arrives is silent — border-image just does nothing.
     Warn, so a missing file reads as a missing file rather than a design choice. */
  if(ui?.selectorPanel){
    const probe = new Image()
    probe.onerror = () => console.warn(
      '[final-call] missing asset: ' + ui.selectorPanel +
      ' — the selector falls back to a plain plate. Expected at ' +
      'public/trips/<trip-id>/' + ui.selectorPanel)
    probe.src = abs(ui.selectorPanel)
  }
  set('--sel-panel-img', ui?.selectorPanel)
  set('--sel-tab-img',   ui?.selectorTab)
  root.classList.toggle('has-sel-art', !!ui?.selectorPanel)
}

function setItinerary(id){
  active = TRIP.data.itineraries.find(i => i.id === id) || TRIP.data.itineraries[0]
  renderAll()
}

function renderAll(){
  Cards.renderSelector(active, setItinerary)
  Cards.renderLengthTabs(active, setItinerary)
  PoiCard.init(active)
  /* v2 trips (with `highlights`) use the Highlights carousel instead — see
     src/js/highlights.js — rendered once at boot, not per-itinerary. */
  if(!TRIP.data.highlights?.length) Pitch.render(active)
  Footer.render(active)
  /* after Footer.render, which has just replaced the .f-ask it watches */
  FinalCall.update(active)
  MapExtras.render(active)
  MapView.setVariant(active)
  MapView.renderPins(active, goToCard)
  Timeline.setItinerary(active)
  scheduleTexture()           /* the pitch just changed height */
  if(Calib?.on) Calib.enableDrag()
}

/* set once the calibration module loads; stays null in production */
let Calib = null

/* Every rebuild of the pins drops the timeline's active-day highlight —
   it's a class on a button MapView has just replaced — so the three call
   sites outside renderAll() put it back. */
function repaintPins(){
  MapView.renderPins(active, goToCard)
  Timeline.refresh()
}

/* a pin opens its card; clicking the same pin again closes it */
function goToCard(locationId){
  PoiCard.toggle(locationId)
}

/* Dev tools are a separate chunk, fetched only when actually wanted:
   during `npm run dev`, or on a deployed site with ?calibrate in the URL.
   A normal visitor never downloads or sees them. */
function devToolsWanted(){
  return import.meta.env.DEV ||
         new URLSearchParams(location.search).has('calibrate')
}

async function initDevTools(){
  if(!devToolsWanted()){
    document.querySelectorAll('[data-dev]').forEach(n => n.remove())
    return
  }
  document.querySelectorAll('[data-dev]').forEach(n => n.removeAttribute('hidden'))
  const mod = await import('./js/calibrate.js')
  Calib = mod.Calib
  Calib.init(repaintPins)
  Calib.apply()
  MapView.placeInset()
  repaintPins()
}

/* The back-to-map bar only appears once the map has scrolled away, so it
   doesn't hover over the hero it would take you back to. */
function initBackToMap(){
  const bar   = document.getElementById('to-map')
  const stage = document.getElementById('stage')
  bar.querySelector('button').addEventListener('click', () => scrollToEl(stage, 1400))

  new IntersectionObserver(
    ([e]) => bar.classList.toggle('is-visible', !e.isIntersecting),
    { threshold:0 }
  ).observe(stage)
}

;(async function boot(){
  const bootEl = document.getElementById('boot')
  Boot.init()
  try{
    await loadData()

    /* The stack is filled and started the moment the DATA is in, which is
       long before the artwork is — that gap is exactly what it covers. */
    Boot.start(TRIP.data)

    /* the shell is trip-agnostic — the real title comes from the data, so a
       second trip doesn't need its own index.html */
    const t = TRIP.data

    /* first, so the faces are already in flight while the rest renders */
    loadFonts(t.artDirection?.fonts)
    applyUiArt(t.artDirection?.ui)
    applyGrid(t.grid)

    document.title = t.subtitle ? `${t.title} — ${t.subtitle}` : t.title
    document.querySelector('meta[name="description"]')
      ?.setAttribute('content', t.subtitle ?? t.title)
    Hero.render(t)
    Highlights.render(t)
    Weather.render(t)

    await MapView.init()
    await Timeline.init()
    MapExtras.initIcon()
    Cards.init()
    Footer.init()
    FinalCall.init()
    Pitch.init()
    addEventListener('resize', scheduleTexture)
    if(document.fonts?.ready) document.fonts.ready.then(scheduleTexture)

    setItinerary(TRIP.data.defaultItineraryId)
    await initDevTools()

    Hero.watchStickers()
    Hero.watchParallax()
    initBackToMap()
    /* crossing the mobile breakpoint changes the crop, which moves every pin */
    MapView.watchBreakpoint(repaintPins)

    window.addEventListener('resize', () => {
      MapView.placeInset()
      Cards.positionMarker()   /* the marker is measured, so it re-measures */
    })

    /* Everything above has RUN, but the images it points at have not
       necessarily arrived — and the first screen is almost entirely image.
       Hold until they have (capped, so a slow line gets the page late
       rather than never), then fade out onto a finished page. */
    await Boot.whenReady()
    Boot.finish()
  }catch(err){
    console.error(err)
    bootEl.innerHTML = `<div class="err">
      <strong>Failed to load trip data.</strong><br><br>
      ${err.message}<br><br>
      Run <code>npm run dev</code> (or <code>npm run preview</code> for a build).
    </div>`
  }
})()
