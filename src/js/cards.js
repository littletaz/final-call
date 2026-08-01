import { TRIP, deriveStats, stayTotal, stopDates, eur } from './data.js'
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

  /* the selector shows duration + when, not the variant's nickname */
  renderSelector(active, onPick){
    this.el.selector.innerHTML = TRIP.data.itineraries.map(it => `
      <button type="button" data-itinerary="${it.id}" aria-current="${it.id === active.id}">
        <span class="num">${it.days}</span>
        <span class="unit">DAYS<br><span class="period">${it.periodDisplay ?? ''}</span></span>
      </button>`).join('')

    this.el.selector.querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => onPick(b.dataset.itinerary)))
  },

  renderStats(itinerary){
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
  hotel(stay, stop){
    const t = stayTotal(stay, stop)
    const amount = t
      ? `${eur(t.lo)}\u2013${eur(t.hi)}`
      : `${eur(stay.priceNightEUR[0])}\u2013${eur(stay.priceNightEUR[1])} <span class="per-night">/night</span>`

    const inner = `
      <span class="tier">${stay.tier.toUpperCase()}</span>
      <span class="name">${stay.name}</span>
      ${stay.base ? `<span class="base">${stay.base}</span>` : ''}
      <span class="amount">${amount}</span>`

    if(!stay.bookingUrl) return `<div class="hotel">${inner}</div>`

    return `<a class="hotel is-link" href="${stay.bookingUrl}"
               target="_blank" rel="noopener noreferrer"
               aria-label="${stay.name} \u2014 opens booking search in a new tab">
      ${inner}
      <span class="go" aria-hidden="true">\u2197</span>
    </a>`
  },

  activity(a){
    const free  = a.priceEUR && a.priceEUR[1] === 0
    const price = !a.priceEUR ? ''
      : free ? `<span class="act-price is-free">FREE</span>`
      : `<span class="act-price">${eur(a.priceEUR[0])}\u2013${eur(a.priceEUR[1])}</span>`

    /* the tooltip carries the note and will carry the image once we have one */
    const tip = a.note
      ? `<span class="act-tip">
           ${a.image ? `<img src="${a.image}" alt="">` : `<span class="act-tip-ph">IMAGE</span>`}
           <span class="act-tip-note">${a.note}</span>
         </span>`
      : ''

    return `<li class="act">
      <span class="act-title">${a.title}</span>
      ${price}${tip}
    </li>`
  },

  card(stop, i, count, dates){
    const loc = TRIP.byId[stop.locationId]
    if(!loc) return ''

    /* a spur is a day trip folded into the previous stop's nights: it still
       earns a pin and a card, but contributes no nights */
    const badge = stop.spur
      ? `<span class="badge is-spur">DAY TRIP</span>`
      : `<span class="badge">${stop.nights} NIGHT${stop.nights === 1 ? '' : 'S'}</span>`

    const d = dates[stop.locationId]
    const dateLine = (d && stop.nights) ? `${fmt(d.from)} \u2013 ${fmt(d.to)}` : ''

    /* sticky + rising z-index is what makes each card slide over the last */
    return `<section class="card" id="card-${loc.id}" style="z-index:${i + 1}">
      <div class="card-inner">

        <div class="c-head">
          <div class="eyebrow">${loc.epithet}</div>
          <h2>${loc.name.en}<span class="jp">${loc.name.jp}</span></h2>
          <p class="subtitle">${loc.subtitle}</p>
          <div class="c-meta">
            ${badge}
            ${dateLine ? `<span class="meta-dates">${dateLine}</span>` : ''}
          </div>
          <div class="rule"></div>
        </div>

        <div class="c-body">
          <div class="chips">
            ${loc.kanjiChips.map(k => `<span class="chip">${k}</span>`).join('')}
            <span class="chip-caption">${loc.chipCaption}</span>
          </div>
          <p class="slot-label">THINGS TO DO</p>
          <ul class="todo">${loc.thingsToDo.map(a => this.activity(a)).join('')}</ul>
        </div>

        <div class="c-media">
          <div class="hero-slot">HERO IMAGE<br>${loc.name.en}</div>
        </div>

        <div class="c-stays">
          <p class="slot-label">WHERE WE SLEEP \u2014 EST. PRICE PER STAY</p>
          <div class="hotels">${loc.stays.slice(0, 3).map(s => this.hotel(s, stop)).join('')}</div>
        </div>

        <div class="c-foot">
          <span>STOP ${i + 1} / ${count}</span>
        </div>

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
