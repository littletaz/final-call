import './styles/tokens.css'
import './styles/main.css'

import { TRIP, loadData } from './js/data.js'
import { MapView } from './js/map.js'
import { Cards } from './js/cards.js'
import { Calib } from './js/calibrate.js'
import { Footer } from './js/footer.js'
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
  Cards.renderStats(active)
  Cards.renderCards(active)
  Footer.render(active)
  MapView.renderPins(active, goToCard)
  if(Calib.on) Calib.enableDrag()
}

function goToCard(locationId){
  if(Calib.on) return          /* clicks place pins, they don't navigate */
  scrollToEl(document.getElementById('card-' + locationId))
}

/* The back-to-map bar only appears once the map has scrolled away, so it
   doesn't hover over the hero it would take you back to. */
function initBackToMap(){
  const bar   = document.getElementById('to-map')
  const stage = document.getElementById('stage')
  bar.querySelector('button').addEventListener('click', () => scrollToEl(stage))

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
    document.title = t.subtitle ? `${t.title} — ${t.subtitle}` : t.title
    document.querySelector('meta[name="description"]')
      ?.setAttribute('content', t.subtitle ?? t.title)
    document.querySelector('#logo img')?.setAttribute('alt', t.title)

    MapView.init()
    Cards.init()
    Footer.init()

    /* saved calibration overrides the committed coordinates */
    Calib.init(() => MapView.renderPins(active, goToCard))
    Calib.apply()
    MapView.placeInset()

    setItinerary(TRIP.data.defaultItineraryId)

    initBackToMap()
    window.addEventListener('resize', () => MapView.placeInset())
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
