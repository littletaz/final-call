import './styles/tokens.css'
import './styles/main.css'
import './styles/flapboard.css'

import { TRIP, loadData } from './js/data.js'
import { MapView } from './js/map.js'
import { Cards } from './js/cards.js'
import { Footer } from './js/footer.js'
import { loadFonts } from './js/fonts.js'
import { FinalCall } from './js/finalcall.js'
import { Parallax } from './js/parallax.js'
import { scrollToEl } from './js/scroll.js'

/* ============================================================
   APP
   One `active` itinerary drives the pins, the dataviz and the
   card stack.
   ============================================================ */
let active = null

function setItinerary(id){
  active = TRIP.data.itineraries.find(i => i.id === id) || TRIP.data.itineraries[0]
  renderAll()
}

function renderAll(){
  Cards.renderSelector(active, setItinerary)
  Cards.renderCards(active)
  Footer.render(active)
  FinalCall.update(active)
  Parallax.refresh()
  MapView.setVariant(active)
  MapView.renderPins(active, goToCard)
  if(Calib?.on) Calib.enableDrag()
}

/* set once the calibration module loads; stays null in production */
let Calib = null

function goToCard(locationId){
  if(Calib?.on) return         /* clicks place pins, they don't navigate */
  const target = document.getElementById('card-' + locationId)
  if(!target) return
  /* +200ms per card, so reaching the third takes 2s + 600ms */
  const index = [...document.querySelectorAll('#cards .card')].indexOf(target)
  scrollToEl(target, 2000 + Math.max(0, index) * 200)
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

    document.title = t.subtitle ? `${t.title} — ${t.subtitle}` : t.title
    document.querySelector('meta[name="description"]')
      ?.setAttribute('content', t.subtitle ?? t.title)
    document.querySelector('#logo img')?.setAttribute('alt', t.title)

    await MapView.init()
    Cards.init()
    Footer.init()
    FinalCall.init()

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
