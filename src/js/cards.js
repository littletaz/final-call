import { MapView } from './map.js'
import { TRIP, deriveStats } from './data.js'
import { countUp } from './countup.js'

/* ============================================================
   SELECTOR · DATAVIZ · STACKED CITY CARDS
   All rendered from the active itinerary, so switching variants
   rebuilds the page from data alone.
   ============================================================ */

const DATE_FMT = { day:'numeric', month:'short' }
const fmt = d => d.toLocaleDateString('en-GB', DATE_FMT)

export const Cards = {
  el: {},

  init(){
    this.el.selector = document.getElementById('selector')
    this.el.stats    = document.getElementById('stats')
    this.el.cards    = document.getElementById('cards')
  },

  /* A single-choice filter, so it's a radiogroup rather than a list of buttons:
     arrow keys move between options, and only the selected one is a tab stop.
     Shows duration + when, never the variant's internal nickname. */
  /* Rebuilt only when the trip changes. Picking a duration used to re-render
     the whole thing, which recreated every element — that's what made the
     numerals flicker. Now only the state changes. */
  renderSelector(active, onPick){
    if(this.built && this.el.selector.querySelector('button')) return this.syncSelector(active)
    this.built = true

    const items = TRIP.data.itineraries
    const activeIndex = Math.max(0, items.findIndex(it => it.id === active.id))

    /* Panel + tab are decoration, so they're aria-hidden; the options carry
       the semantics. The date sits in its own absolutely-positioned slot so
       revealing it on hover can't move anything. */
    this.el.selector.innerHTML =
      `<div class="sel-panel" aria-hidden="true"></div>` +
      `<p class="sel-tab">ITINERARY</p>` +
      `<div class="sel-options">` +
        `<span class="sel-track" aria-hidden="true"><span class="sel-marker"></span></span>` +
        items.map((it, i) => `
          <button type="button" role="radio"
                  data-itinerary="${it.id}" data-index="${i}"
                  aria-checked="${it.id === active.id}"
                  tabindex="${i === activeIndex ? 0 : -1}">
            <span class="sel-dot" aria-hidden="true"></span>
            <span class="sel-num">${it.days}</span>
            <span class="sel-lbl">DAYS</span>
            <span class="sel-period">${it.periodDisplay ?? ''}</span>
          </button>`).join('') +
      `</div>`

    const buttons = [...this.el.selector.querySelectorAll('button')]

    buttons.forEach(b => {
      b.addEventListener('click', () => onPick(b.dataset.itinerary))
      /* fetch any alternate map artwork before it's needed, so the swap is
         instant rather than fading in from nothing */
      b.addEventListener('pointerenter', () => MapView.preloadVariant(
        TRIP.data.itineraries.find(i => i.id === b.dataset.itinerary)), { once:true })
      b.addEventListener('keydown', e => {
        const step = { ArrowDown:1, ArrowRight:1, ArrowUp:-1, ArrowLeft:-1 }[e.key]
        if(!step) return
        e.preventDefault()
        /* wrap around, the way a radiogroup is expected to behave */
        const next = buttons[(+b.dataset.index + step + buttons.length) % buttons.length]
        next.focus()
        onPick(next.dataset.itinerary)
      })
    })

    this.positionMarker()
  },

  /* The marker is one element that slides, rather than a pseudo-element on each
     option pinned with magic offsets. Its position is measured from the chosen
     button, so it stays aligned whatever the type size or spacing. */
  /* Only the state: which option is checked, which is focusable, and where the
     marker sits. Nothing is created or destroyed. */
  syncSelector(active){
    const buttons = [...this.el.selector.querySelectorAll('button')]
    buttons.forEach(b => {
      const on = b.dataset.itinerary === active.id
      b.setAttribute('aria-checked', String(on))
      b.tabIndex = on ? 0 : -1
    })
    this.positionMarker()
  },

  /* The marker lives inside .sel-track, which starts half a row down so the
     dashed rule spans dot-to-dot rather than the full height. So the offset is
     measured against the track, not the options box. */
  positionMarker(){
    const sel = this.el.selector.querySelector('.sel-options') || this.el.selector
    const marker  = sel.querySelector('.sel-marker')
    const track   = sel.querySelector('.sel-track')
    const current = sel.querySelector('button[aria-checked="true"]')
    if(!marker || !current || !track) return
    const y = current.offsetTop + current.offsetHeight / 2 - track.offsetTop
    marker.style.transform = `translateY(${y}px)`
  },

  /* #stats is rebuilt by the footer on every render, so the element has to be
     looked up now rather than cached at init — a stale reference silently
     renders into a detached node. */
  renderStats(itinerary){
    const host = document.getElementById('stats')
    if(!host) return
    this.el.stats = host
    const s = deriveStats(itinerary)
    const items = [
      ['NIGHTS',  s.nights],
      ['PLACES',  s.places],
      ['RENTALS', s.rentals],
      ['FLIGHTS', s.flights],
    ]
    this.el.stats.innerHTML = items.map(([key, val]) => `
      <div class="stat">
        <div class="val" data-count-to="${val}">0</div>
        <div class="key">${key}</div>
        <div class="rule"></div>
      </div>`).join('')

    countUp(this.el.stats.querySelectorAll('[data-count-to]'))
  },

  /* On overnight stops we show the total for the stay; on day-trip spurs
     there is no stay, so we show the nightly rate instead — useful if you
     ever decide to sleep there. */
  /* On overnight stops the figure is the total for the stay; on day-trip spurs
     there is no stay, so it falls back to the nightly rate.
     A stay with a bookingUrl renders as a link; without one it stays a plain
     block rather than a dead anchor. */
  /* On overnight stops the figure is the total for the stay; on day-trip spurs
     there is no stay, so it falls back to the nightly rate. */




}
