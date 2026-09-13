import { TRIP, tripBudget, sleepOptionCost, buildLedger, eur,
         tripOrigins, resolveOrigin } from './data.js'

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

/* "So… Are you in?" → "So… Are you " + a highlighted "in?" — matches the
   Figma End screen's two-tone treatment without hardcoding the copy. */
function askTitle(headline){
  const words = headline.split(' ')
  const last = words.pop()
  return `${words.join(' ')} <span class="f-ask-highlight">${last}</span>`
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
          <div class="bud" id="bud"></div>
        </div>
      </section>

      <section class="f-ask">
        <h2 class="f-ask-title">${askTitle(cta.headline ?? 'So\u2026 Are you in?')}</h2>
        <div class="ask-actions">
          <a class="fc-btn fc-no" href="./no.html${TRIP.id ? `?trip=${encodeURIComponent(TRIP.id)}` : ''}">NO</a>
          <a class="fc-btn fc-yes" ${url ? `href="${url}" target="_blank" rel="noopener noreferrer"` : 'aria-disabled="true"'}>YES</a>
        </div>
      </section>`

    this.renderBudget(itinerary)
  },

  renderBudget(itinerary){
    const host = document.getElementById('bud')
    if(!host) return
    if(TRIP.data.budget?.model === 'ledger') return this.renderLedger(host, itinerary)
    this.renderBudgetLevers(host, itinerary)
  },

  /* v2 — flat itemized ledger, one <details> group per base stop. See
     data.js:buildLedger(). No levers: every number is already authored on
     a location (stays/thingsToDo) or in budget.fixed. */
  renderLedger(host, itinerary){
    /* Sticky across re-renders: switching itinerary rebuilds this whole
       block, and a reader who picked Lyon should not be put back on Paris
       by choosing a different trip length. */
    this.originId ??= TRIP.data.budget?.defaultOriginId
    const origin  = resolveOrigin(this.originId)
    const origins = tripOrigins()
    const { groups, total } = buildLedger(itinerary, 'budget', origin?.id)

    /* A real <select>, not a div dressed as one: it comes with keyboard
       support, the platform's own picker on a phone and a screen-reader
       role for free. The chevron beside it is ours (the native arrow is
       hidden in budget.css) so it still matches the Figma control. */
    const control = origins.length > 1
      ? `<div class="ledger-origin">
           <select class="ledger-origin-select" aria-label="Ville de depart">
             ${origins.map(o => `<option value="${o.id}"${o.id === origin?.id ? ' selected' : ''}
                >Depart : ${o.label}</option>`).join('')}
           </select>
           <span class="ledger-origin-chevron" aria-hidden="true"></span>
         </div>`
      : origin
        ? `<div class="ledger-origin">
             <span>Depart : ${origin.label}</span>
             <span class="ledger-origin-chevron" aria-hidden="true"></span>
           </div>`
        : ''

    host.className = 'bud grid-12'
    host.innerHTML = `
      <header class="ledger-head col-full">
        <p class="ledger-title">Le budget</p>
        ${control}
      </header>
      <div class="ledger-list">
        ${groups.map(g => `
          <details class="ledger-group" open>
            <summary class="ledger-group-name">
              <span class="ledger-chevron" aria-hidden="true"></span>
              <span>${g.label}</span>
            </summary>
            <ul class="ledger-items">
              ${g.items.map(i => `<li><span>${i.label}</span><span>${i.free ? 'gratuit' : `${eur(i.lo)}–${eur(i.hi)}`}</span></li>`).join('')}
            </ul>
          </details>`).join('')}
        <div class="ledger-total"><span>Total estime</span><span>${eur(total.lo)}–${eur(total.hi)}</span></div>
      </div>`

    /* Delegated, and bound ONCE to the host rather than to the select: this
       method rewrites host.innerHTML on every itinerary switch and on every
       origin change, so a listener attached to the element itself is thrown
       away and re-made constantly, and any path that re-renders without
       coming back through here would silently leave a dead control. The host
       outlives all of it.

       Re-render rather than patch the one line: the fare moves the total too,
       and the group it sits in is rebuilt by the same call. The ledger's
       height changes with it, but the lower stickers need nothing here —
       Hero.watchStickers() observes body and re-places them. */
    if(!this.originBound){
      this.originBound = true
      host.addEventListener('change', e => {
        const sel = e.target.closest?.('.ledger-origin-select')
        if(!sel) return
        this.originId = sel.value
        this.renderLedger(host, this.itinerary ?? itinerary)
      })
    }
    this.itinerary = itinerary
  },

  /* v1 — formula/lever model. Unchanged, still used by any trip whose
     budget doesn't declare the ledger model (e.g. japon-2026 for now). */
  renderBudgetLevers(host, itinerary){
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

      ${model.levers ? `<div class="bud-levers">${['sleep','eat','move'].map(lever).join('')}</div>` : ''}`

    host.querySelectorAll('.bud-opt').forEach(btn =>
      btn.addEventListener('click', () => {
        this.choice[btn.dataset.lever] = btn.dataset.option
        this.renderBudget(itinerary)   /* not render() — the wall must survive */
      }))
  },
}
