import { MapView } from './map.js'
import { TRIP, tripAsset, deriveStats, stayTotal, stopDates, eur } from './data.js'
import { countUp } from './countup.js'
import { layoutFor } from './scatter.js'

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
  renderSelector(active, onPick){
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
  /* On overnight stops the figure is the total for the stay; on day-trip spurs
     there is no stay, so it falls back to the nightly rate. */
  hotel(stay, stop){
    const t = stayTotal(stay, stop)
    const amount = t
      ? `${eur(t.lo)}\u2013${eur(t.hi)}`
      : `${eur(stay.priceNightEUR[0])}\u2013${eur(stay.priceNightEUR[1])}<span class="per-night">/night</span>`

    const inner = `
      <span class="tier">${stay.tier[0].toUpperCase() + stay.tier.slice(1)}</span>
      <span class="hotel-row">
        <span class="name">${stay.name}</span>
        <span class="amount">${amount}</span>
      </span>`

    if(!stay.bookingUrl) return `<div class="hotel">${inner}</div>`
    return `<a class="hotel is-link" href="${stay.bookingUrl}"
               target="_blank" rel="noopener noreferrer"
               title="${stay.name}"
               aria-label="${stay.name} \u2014 opens booking search in a new tab">
      ${inner}</a>`
  },


  /* Photos, scattered. Empty slots aren't rendered, so a city with three
     photos simply uses the first three positions of its layout. */
  scatter(loc, i){
    const photos = loc.photos ?? []
    if(!photos.length) return ''
    const slots = layoutFor(loc, i)

    return `<div class="c-photos" aria-hidden="true">${
      photos.slice(0, slots.length).map((ph, n) => {
        const s = slots[n]
        return `<figure class="photo" style="
            left:${s.x}%;top:${s.y}%;width:${s.w}%;
            --rot:${s.r}deg;--depth:${s.d}">
          ${ph.src ? `<img src="${tripAsset(ph.src)}" alt="" loading="lazy">`
                   : `<span class="photo-ph">${n + 1}</span>`}
        </figure>`
      }).join('')}</div>`
  },

  card(stop, i, count, dates){
    const loc = TRIP.byId[stop.locationId]
    if(!loc) return ''

    const nights = stop.spur
      ? `<span class="when-nights is-spur">day trip</span>`
      : `<span class="when-nights">${stop.nights} night${stop.nights === 1 ? '' : 's'}</span>`

    const d = dates[stop.locationId]
    const dateLine = (d && stop.nights)
      ? `<span class="when-dates">${fmt(d.from)} \u2013 ${fmt(d.to)}</span>` : ''

    const stays = loc.stays.slice(0, 3).map(st => this.hotel(st, stop)).join('')

    /* Things to do are deliberately not rendered — they stay in the data for
       later. The card is the place, not the itinerary. */
    return `<section class="card" id="card-${loc.id}" style="z-index:${i + 1}">
      ${this.scatter(loc, i)}

      <div class="card-inner">
        <header class="c-head">
          <p class="c-sub">
            ${loc.kanjiChips.map(k => `<span class="chip">${k}</span>`).join('')}
            <span class="c-when">${dateLine}${nights}</span>
          </p>
        </header>

        <h2 class="c-title">${loc.name.en}</h2>

        <section class="c-stays">
          <h3 class="stays-title">where we sleep</h3>
          ${loc.stays.length
            ? `<div class="hotels">${stays}</div>`
            : `<p class="no-stay">No stay \u2014 folded into the neighbouring base.</p>`}
        </section>
      </div>
    </section>`
  },

  renderCards(itinerary){
    const dates = stopDates(itinerary)
    this.el.cards.innerHTML = itinerary.stops
      .map((stop, i) => this.card(stop, i, itinerary.stops.length, dates))
      .join('')
  },
}
