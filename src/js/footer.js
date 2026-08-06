import { TRIP, tripBudget, sleepOptionCost, eur } from './data.js'
import { Cards } from './cards.js'

/* ============================================================
   FOOTER
   Two moments, stacked:

     1  the dataviz and the cost of the trip
     2  a wall of flaps that asks the question

   The cost block answers before it asks anything — a number is
   there on arrival and the levers are for "but what if we…",
   not a form to fill in first.
   ============================================================ */

const PROVIDERS = {
  kayak: {
    label: 'Kayak',
    build: ({ legs, passengers, cabin }) => {
      const path = legs.map(l => `${l.from}-${l.to}/${l.date}`).join('/')
      const extras = [
        passengers > 1 ? `${passengers}adults` : null,
        cabin && cabin !== 'economy' ? cabin : null,
      ].filter(Boolean).join('/')
      return `https://www.kayak.com/flights/${path}${extras ? '/' + extras : ''}?sort=bestflight_a`
    },
  },
  momondo: {
    label: 'Momondo',
    build: ({ legs, passengers }) =>
      `https://www.momondo.com/flight-search/${legs.map(l => `${l.from}-${l.to}/${l.date}`).join('/')}` +
      (passengers > 1 ? `/${passengers}adults` : ''),
  },
  google: {
    label: 'Google Flights',
    build: ({ legs }) =>
      'https://www.google.com/travel/flights?q=' +
      encodeURIComponent(`Flights from ${legs[0].from} to ${legs[0].to} on ${legs[0].date}`),
  },
}

/* Legs come from the ITINERARY first, falling back to the trip.
   They have to: only the first and last legs follow the itinerary's dates, so a
   trip-level list with hardcoded middle legs produced an impossible sequence
   the moment you switched duration — coast-12 flew Paris to Hong Kong (a city
   it doesn't visit) and came home a month before its own connecting flight. */
function resolveLegs(search, itinerary){
  const dr = itinerary.dateRange || {}
  const pick = ref =>
    ref === 'itineraryStart' ? dr.start :
    ref === 'itineraryEnd'   ? dr.end   : ref
  const legs = itinerary.flightSearch?.legs ?? search.legs ?? []
  const out = legs
    .map(l => ({ from:l.from, to:l.to, date: pick(l.dateFrom ?? l.date) }))
    .filter(l => l.from && l.to && l.date)

  /* A search whose dates run backwards is rejected outright, so it's worth
     saying so here rather than letting the button quietly go nowhere. */
  for(let i = 1; i < out.length; i++){
    if(out[i].date < out[i - 1].date){
      console.warn(`[final-call] ${itinerary.id}: flight legs are out of order — `
        + `${out[i-1].from}-${out[i-1].to} on ${out[i-1].date} then `
        + `${out[i].from}-${out[i].to} on ${out[i].date}. `
        + `Give this itinerary its own flightSearch.legs.`)
      break
    }
  }
  return out
}

export function flightSearchUrl(itinerary){
  const fs = TRIP.data?.cta?.flightSearch
  if(!fs) return null
  const legs = resolveLegs(fs, itinerary)
  if(!legs.length) return null
  const provider = PROVIDERS[fs.provider] || PROVIDERS.kayak
  return provider.build({ legs, passengers: fs.passengers ?? 1, cabin: fs.cabin ?? 'economy' })
}

/* the colour of each segment, dearest first so the bar reads by weight */
const SEG = {
  stays:'var(--seal)', flights:'rgba(255,255,255,.85)', food:'rgba(255,255,255,.55)',
  transport:'rgba(255,255,255,.32)', activities:'rgba(255,255,255,.16)',
}

export const Footer = {
  el: null,
  choice: {},

  init(){
    this.el = document.getElementById('footer')
    const lv = TRIP.data?.budget?.levers
    if(lv) this.choice = Object.fromEntries(
      Object.entries(lv).map(([k, v]) => [k, v.default]))
  },

  /* The shell is built ONCE. Adjusting a lever only redraws the cost block —
     re-rendering the whole footer would tear down the wall below it, which is
     ~275 tiles and, more to the point, mid-animation. */
  render(itinerary){
    if(!this.el) return
    const cta = TRIP.data.cta ?? {}
    const url = flightSearchUrl(itinerary)

    this.el.innerHTML = `
      <section class="f-costs">
        <div class="f-inner">
          <div id="stats"></div>
          <div class="bud" id="bud"></div>
        </div>
      </section>

      <section class="f-ask">
        <h2 class="f-ask-title">${cta.headline ?? 'So\u2026 Are you in?'}</h2>
        <div class="ask-actions">
          <a class="fc-btn fc-no" href="./no.html${TRIP.id ? `?trip=${encodeURIComponent(TRIP.id)}` : ''}">NO</a>
          <a class="fc-btn fc-yes" ${url ? `href="${url}" target="_blank" rel="noopener noreferrer"` : 'aria-disabled="true"'}>YES</a>
        </div>
      </section>`

    Cards.renderStats(itinerary)
    this.renderBudget(itinerary)
  },

  renderBudget(itinerary){
    const host = document.getElementById('bud')
    if(!host) return
    const model = TRIP.data.budget
    const b = tripBudget(itinerary, this.choice)
    const cta = TRIP.data.cta ?? {}
    const url = flightSearchUrl(itinerary)
    const max = b.total.hi || 1

    const bar = b.rows.map(r => `
      <span class="bud-seg" style="width:${(r.hi / b.rows.reduce((n,x)=>n+x.hi,0) * 100).toFixed(2)}%;
            background:${SEG[r.id] ?? 'rgba(255,255,255,.3)'}"></span>`).join('')

    const legend = b.rows.map(r => `
      <li>
        <span class="bud-swatch" style="background:${SEG[r.id] ?? 'rgba(255,255,255,.3)'}"></span>
        <span class="bud-key">${r.label}</span>
        <span class="bud-val">${eur(r.lo)}\u2013${eur(r.hi)}</span>
      </li>`).join('')

    const lever = (key) => {
      const lv = model.levers[key]
      return `<div class="bud-lever">
        <p class="bud-lever-title">${lv.label}</p>
        ${lv.options.map(o => {
          const on = this.choice[key] === o.id
          const cost = key === 'sleep'
            ? sleepOptionCost(itinerary, o.id)
            : { lo:o.eur[0] * (lv.perNight ? b.nights : 1),
                hi:o.eur[1] * (lv.perNight ? b.nights : 1) }
          void cost
          return `<button type="button" class="bud-opt${on ? ' on' : ''}"
                          data-lever="${key}" data-option="${o.id}"
                          aria-pressed="${on}">${o.label}</button>`
        }).join('')}
      </div>`
    }

    host.innerHTML = `
      <header class="bud-head">
        <div>
          <p class="slot-label">PER PERSON, ALL IN</p>
          <p class="bud-total">${eur(b.total.lo)} \u2013 ${eur(b.total.hi)}</p>
          <p class="bud-sub">${itinerary.days} days \u00B7 ${TRIP.data.cta?.flightSearch?.passengers ?? 2} travellers</p>
        </div>
      </header>

      <div class="bud-bar">${bar}</div>
      <ul class="bud-legend">${legend}</ul>

      <div class="bud-levers">${['sleep','eat','move'].map(lever).join('')}</div>`

    host.querySelectorAll('.bud-opt').forEach(btn =>
      btn.addEventListener('click', () => {
        this.choice[btn.dataset.lever] = btn.dataset.option
        this.renderBudget(itinerary)   /* not render() — the wall must survive */
      }))
  },
}
