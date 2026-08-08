import './styles/tokens.css'
import './styles/main.css'
import './styles/flapboard.css'
import './styles/pitch.css'

import { TRIP, tripAsset, loadData } from './js/data.js'
import { MapView } from './js/map.js'
import { Cards } from './js/cards.js'
import { PoiCard } from './js/poicard.js'
import { Footer } from './js/footer.js'
import { Pitch } from './js/pitch.js'
import { loadFonts } from './js/fonts.js'
import { FinalCall } from './js/finalcall.js'
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
/* The grain covers the sea-blue part of the page and stops where the stacked
   slides begin. That boundary is the top of .p-gem, which only layout knows —
   so it's measured rather than guessed, and re-measured when the itinerary
   changes (a different pitch is a different height). */
function sizeTexture(){
  const tex = document.getElementById('texture')
  if(!tex) return
  /* The sheet covers everything that SCROLLS — map, mood, cards — and stops at
     #stack. Past there each slide locks to the top, and a scrolling sheet would
     drag its grain across held type. The floor slide carries the same sea blue,
     so the join is invisible. */
  /* The scrolling sheet covers the MAP and stops at the stack. The cards carry
     their own grain from there (.p-cards::after) because they're held — a
     scrolling sheet would drag across them. */
  const stack = document.querySelector('#stack')
  if(!stack){ tex.style.height = '' ; return }

  const top = Math.max(0, Math.round(stack.getBoundingClientRect().top + window.scrollY))
  tex.style.height = top + 'px'

  /* The cards' own sheet picks up where this one stops, so the paper runs
     unbroken from the map into the cards rather than restarting. */
  const open = document.querySelector('.p-cards')
  if(open){
    const w = document.getElementById('stage')?.clientWidth || window.innerWidth
    const tile = w * (1981 / 1440)
    open.style.setProperty('--tex-offset', `${-(top % tile).toFixed(1)}px`)
  }


}

/* Every stacked slide is exactly one screen. That's a content constraint, not a
   layout one: the slides are fixed at 100vh in css, so content that doesn't fit
   is CLIPPED rather than scrollable — writing less is the only fix.

   This checks the content against the slide it's in and says so, since a
   clipped slide looks fine until the thing that got cut off mattered. */
function checkSlideHeights(){
  document.querySelectorAll('.p-gem, .f-costs, .f-ask').forEach(el => {
    const over = el.scrollHeight - el.clientHeight
    if(over > 8){
      console.warn(`[final-call] .${el.className.split(' ')[0]} overflows its screen `
        + `by ${Math.round(over)}px — that content is clipped, not scrollable`)
    }
  })
}

let texRaf
function scheduleTexture(){
  cancelAnimationFrame(texRaf)
  texRaf = requestAnimationFrame(() => { checkSlideHeights(); sizeTexture() })
}

/* Sticky is contained by the parent BOX, so the three stacked slides have to be
   real siblings. Pitch and Footer each render into their own element, then their
   stacked sections are moved here — which keeps both renderers independent
   while giving the stack one honest container.

   `.p-cards` leads the stack. The mood above it stays in #pitch as ordinary
   scroll — it belongs with the map, not with the slides. */
function assembleStack(){
  const stack = document.getElementById('stack')
  if(!stack) return
  const slides = [
    document.querySelector('#pitch .p-cards'),  /* the cards hold the stack open */
    document.querySelector('#pitch .p-gem'),
    document.querySelector('#footer .f-costs'),
    document.querySelector('#footer .f-ask'),
  ].filter(Boolean)

  /* replaceChildren, not append: a re-render creates NEW sections, and appending
     them left the previous set in place — two budget blocks stacked on each
     other after one change of duration. This also drops the gem when an
     itinerary has no pitch written. */
  stack.replaceChildren(...slides)
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
  PoiCard.init(active)
  Pitch.render(active)        /* the argument changes with the itinerary */
  Footer.render(active)
  assembleStack()             /* both just re-rendered; re-collect their slides */
  FinalCall.update(active)
  FinalCall.watchAsk()        /* the footer was just rebuilt — re-observe it */
  MapView.setVariant(active)
  MapView.renderPins(active, goToCard)
  scheduleTexture()           /* the pitch just changed height */
  if(Calib?.on) Calib.enableDrag()
}

/* set once the calibration module loads; stays null in production */
let Calib = null

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
  Calib.init(() => MapView.renderPins(active, goToCard))
  Calib.apply()
  MapView.placeInset()
  MapView.renderPins(active, goToCard)
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
  try{
    await loadData()

    /* the shell is trip-agnostic — the real title comes from the data, so a
       second trip doesn't need its own index.html */
    const t = TRIP.data

    /* first, so the faces are already in flight while the rest renders */
    loadFonts(t.artDirection?.fonts)
    applyUiArt(t.artDirection?.ui)

    document.title = t.subtitle ? `${t.title} — ${t.subtitle}` : t.title
    document.querySelector('meta[name="description"]')
      ?.setAttribute('content', t.subtitle ?? t.title)
    document.querySelector('#logo img')?.setAttribute('alt', t.title)

    await MapView.init()
    Cards.init()
    Footer.init()
    Pitch.init()
    /* Before the first render: init only grabs elements from the static shell,
       and update() bails silently if they aren't there yet — which is exactly
       what left the YES button on its placeholder href. The ask observer is a
       separate call, because THAT does need the footer to exist. */
    FinalCall.init()
    addEventListener('resize', scheduleTexture)
    if(document.fonts?.ready) document.fonts.ready.then(scheduleTexture)

    setItinerary(TRIP.data.defaultItineraryId)
    await initDevTools()

    initBackToMap()
    /* crossing the mobile breakpoint changes the crop, which moves every pin */
    MapView.watchBreakpoint(() => MapView.renderPins(active, goToCard))

    window.addEventListener('resize', () => {
      MapView.placeInset()
      Cards.positionMarker()   /* the marker is measured, so it re-measures */
    })
    bootEl.classList.add('hide')
  }catch(err){
    console.error(err)
    bootEl.innerHTML = `<div class="err">
      <strong>Failed to load trip data.</strong><br><br>
      ${err.message}<br><br>
      Run <code>npm run dev</code> (or <code>npm run preview</code> for a build).
    </div>`
  }
})()
