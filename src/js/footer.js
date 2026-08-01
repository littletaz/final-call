import { TRIP, tripBudget, eur } from './data.js'

/* ============================================================
   FOOTER
   Budget by category, a comfort slider that rescales it, and the
   closing call to action.
   ============================================================ */

const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const pretty = iso => {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()} ${MONTH[d.getMonth()]} ${d.getFullYear()}`
}

/* ---------- flight search ----------
   Kayak and Momondo express multi-city as a path: one /FROM-TO/DATE segment per
   leg. Stable for years, no encoding needed, and it searches every leg at once.

   Google Flights hides multi-city inside its `tfs` parameter, a base64url
   protobuf that changes periodically — so `google` deliberately degrades to a
   natural-language search of the FIRST leg only, rather than shipping an
   encoded URL that could silently break. Switch providers in the trip data. */

const PROVIDERS = {
  kayak: {
    label: 'Kayak',
    multiCity: true,
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
    multiCity: true,
    build: ({ legs, passengers }) => {
      const path = legs.map(l => `${l.from}-${l.to}/${l.date}`).join('/')
      return `https://www.momondo.com/flight-search/${path}` +
             (passengers > 1 ? `/${passengers}adults` : '')
    },
  },

  google: {
    label: 'Google Flights',
    multiCity: false,
    build: ({ legs }) => {
      const l = legs[0]
      const q = `Flights from ${l.from} to ${l.to} on ${l.date}`
      return 'https://www.google.com/travel/flights?q=' + encodeURIComponent(q)
    },
  },
}

/* Shared with the sticky Final Call widget, so both link to exactly the same
   search. Returns null when the itinerary has no dates to search with. */
export function flightSearchUrl(itinerary){
  const fs = TRIP.data?.cta?.flightSearch
  if(!fs) return null
  const legs = resolveLegs(fs, itinerary)
  if(!legs.length) return null
  const provider = PROVIDERS[fs.provider] || PROVIDERS.kayak
  return provider.build({
    legs,
    passengers: fs.passengers ?? 1,
    cabin: fs.cabin ?? 'economy',
  })
}

/* `dateFrom` lets the data reference the itinerary instead of hardcoding dates,
   so the link follows whichever variant is selected. */
function resolveLegs(search, itinerary){
  const dr = itinerary.dateRange || {}
  const pick = ref =>
    ref === 'itineraryStart' ? dr.start :
    ref === 'itineraryEnd'   ? dr.end   : ref

  return (search.legs ?? [])
    .map(l => ({ from: l.from, to: l.to, date: pick(l.dateFrom ?? l.date) }))
    .filter(l => l.from && l.to && l.date)
}

export const Footer = {
  el: {},
  tierId: null,

  init(){
    this.el.root = document.getElementById('footer')
    this.tierId  = TRIP.data.budget.defaultTierId
  },

  render(itinerary){
    const model = TRIP.data.budget
    const cta   = TRIP.data.cta
    const b     = tripBudget(itinerary, this.tierId)
    const tiers = model.comfortTiers
    const idx   = Math.max(0, tiers.findIndex(t => t.id === this.tierId))

    /* bars are scaled against the largest row, not the total, so the smaller
       categories stay legible instead of collapsing to slivers */
    const max = Math.max(...b.rows.map(r => r.hi)) || 1

    const rows = b.rows.map(r => `
      <div class="f-row">
        <span class="f-cat">${r.label}</span>
        <span class="f-bar"><span class="f-bar-fill" style="width:${(r.hi / max * 100).toFixed(1)}%"></span></span>
        <span class="f-amt">${eur(r.lo)}\u2013${eur(r.hi)}</span>
      </div>`).join('')

    const ticks = tiers.map((t, i) => `
      <button type="button" class="f-tick${i === idx ? ' on' : ''}"
              data-tier="${t.id}">${t.label}</button>`).join('')

    const fs       = cta.flightSearch || {}
    const provider = PROVIDERS[fs.provider] || PROVIDERS.kayak
    const legs     = resolveLegs(fs, itinerary)

    let ctaBlock
    if(!legs.length){
      ctaBlock = `<button class="f-yes is-disabled" type="button" disabled>${cta.buttonLabel}</button>
        <p class="f-cta-note">Pick exact dates for this itinerary to search flights.</p>`
    } else {
      const url = provider.build({
        legs,
        passengers: fs.passengers ?? 1,
        cabin: fs.cabin ?? 'economy',
      })
      const route = legs.map(l => `${l.from} \u2192 ${l.to}`).join(' \u00B7 ')
      const span  = legs.length > 1
        ? `${pretty(legs[0].date)} \u2013 ${pretty(legs[legs.length - 1].date)}`
        : pretty(legs[0].date)

      /* a provider that can't do multi-city gets an honest caveat rather than a
         link that quietly searches less than it claims */
      const caveat = (!provider.multiCity && legs.length > 1)
        ? ` \u2014 ${provider.label} can only search the first leg, so book
            ${legs[legs.length - 1].from} \u2192 ${legs[legs.length - 1].to} separately.`
        : ''

      ctaBlock = `<a class="f-yes" href="${url}" target="_blank" rel="noopener">${cta.buttonLabel}</a>
        <p class="f-cta-note">
          ${route} \u00B7 ${span}${fs.passengers > 1 ? ` \u00B7 ${fs.passengers} travellers` : ''}.
          Opens a ${legs.length > 1 && provider.multiCity ? 'multi-city ' : ''}search
          on ${provider.label}${caveat}
        </p>`
    }

    this.el.root.innerHTML = `
      <div class="f-inner">

        <div class="f-head">
          <p class="slot-label">WHAT IT COSTS</p>
          <h2>Per person, all in</h2>
          <p class="f-sub">${itinerary.days} days \u00B7 ${itinerary.periodDisplay ?? ''}</p>
        </div>

        <div class="f-tiers">
          <p class="slot-label">HOW COMFORTABLE</p>
          <input class="f-range" type="range" min="0" max="${tiers.length - 1}"
                 step="1" value="${idx}" aria-label="Comfort level">
          <div class="f-ticks">${ticks}</div>
        </div>

        <div class="f-rows">${rows}</div>

        <div class="f-total">
          <span class="f-total-label">TOTAL, EACH</span>
          <span class="f-total-amt">${eur(b.total.lo)}\u2013${eur(b.total.hi)}</span>
          <span class="f-total-note">
            ${b.tier.label.toLowerCase()} \u00B7 roughly
            ${eur(b.total.lo / itinerary.days)}\u2013${eur(b.total.hi / itinerary.days)} a day
          </span>
        </div>

        <div class="f-cta">
          <h3>${cta.headline}</h3>
          ${ctaBlock}
        </div>

      </div>`

    this.bind(itinerary)
  },

  bind(itinerary){
    const tiers = TRIP.data.budget.comfortTiers
    const range = this.el.root.querySelector('.f-range')

    range.addEventListener('input', () => {
      this.tierId = tiers[+range.value].id
      this.render(itinerary)
      /* keep focus on the slider so it can be dragged straight after re-render */
      this.el.root.querySelector('.f-range')?.focus()
    })

    this.el.root.querySelectorAll('.f-tick').forEach(btn =>
      btn.addEventListener('click', () => {
        this.tierId = btn.dataset.tier
        this.render(itinerary)
      }))
  },
}
