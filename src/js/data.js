import { asset } from './paths.js'

/* ============================================================
   DATA
   One file per trip. `trips/index.json` is the registry; each
   trip file carries its own manifest, locations and itineraries.
   Load a specific trip with ?trip=<id>.
   ============================================================ */

export const TRIP = {
  registry: null,
  id: null,          /* the ?trip= value that selected this one */
  file: null,        /* e.g. trips/japan-2026/trip.json */
  dir: null,         /* e.g. trips/japan-2026 — assets resolve against this */
  data: null,
  byId: {},
}

/* Every asset path inside a trip file is relative to that trip's own folder,
   so two trips can both ship a `pin.svg` without colliding. Anything under
   shared/ is addressed absolutely and skips this. */
export function tripAsset(p){
  if(!p) return p
  if(/^(https?:)?\/\//.test(p) || p.startsWith('shared/')) return asset(p)
  return asset(`${TRIP.dir}/${p}`)
}

async function getJSON(url){
  const res = await fetch(asset(url))
  if(!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

export async function loadData(){
  const registry = await getJSON('trips/index.json')
  TRIP.registry = registry

  const wanted = new URLSearchParams(location.search).get('trip')
  const entry  = registry.trips.find(t => t.id === wanted)
              || registry.trips.find(t => t.id === registry.defaultTripId)
              || registry.trips[0]
  if(!entry) throw new Error('trips/index.json lists no trips')

  const data = await getJSON(entry.file)
  TRIP.id   = entry.id
  TRIP.file = entry.file
  TRIP.dir  = entry.file.replace(/\/[^/]*$/, '')
  TRIP.data = data
  TRIP.byId = Object.fromEntries(data.locations.map(l => [l.id, l]))

  /* fail loudly on a bad reference rather than rendering a blank card */
  const missing = []
  for(const it of data.itineraries)
    for(const s of it.stops)
      if(!TRIP.byId[s.locationId]) missing.push(`${it.id} → ${s.locationId}`)
  if(missing.length) console.warn('[data] unresolved locationIds:', missing)

  if(data.map?._calibrated === false)
    console.info('[japon] Pin coordinates are uncalibrated guesses — use the CALIBRATE panel.')

  return TRIP
}

/* ---------- derived ----------
   Nights are summed from the stops rather than stored, so the dataviz can
   never drift out of sync with the itinerary. RENTALS is 0 by design (the
   route is deliberately car-free). FLIGHTS is explicit in the data because
   whether the journey home counts is a judgement call. */
export function deriveStats(itinerary){
  return {
    nights:  itinerary.stops.reduce((n, s) => n + (s.nights || 0), 0),
    places:  itinerary.stops.length,
    rentals: 0,
    flights: itinerary.flights ?? 0,
  }
}

/* A stay may pin its own `nights` when a stop is split across bases
   (2 nights Takayama + 4 nights Hirayu). Otherwise it inherits the stop's
   full count. Without this, per-stay totals multiply by the whole stop
   length and come out badly wrong. */
export function stayNights(stay, stop){
  return stay.nights != null ? stay.nights : (stop.nights || 0)
}

export function stayTotal(stay, stop){
  const n = stayNights(stay, stop)
  if(!n) return null                       /* spur: no overnight here */
  const [lo, hi] = stay.priceNightEUR
  return { nights:n, lo:lo*n, hi:hi*n, perNight:[lo, hi] }
}

/* Per-card budget: the cheapest stay for this stop plus every activity.
   Cheapest rather than average, so the figure reads as "what this costs if
   we're careful" — the number that's actually useful when comparing stops. */
export function cardBudget(location, stop){
  const acts  = location.thingsToDo ?? []
  const actLo = acts.reduce((n, a) => n + (a.priceEUR?.[0] ?? 0), 0)
  const actHi = acts.reduce((n, a) => n + (a.priceEUR?.[1] ?? 0), 0)

  const totals = location.stays
    .map(s => stayTotal(s, stop))
    .filter(Boolean)
    .sort((a, b) => a.lo - b.lo)
  const cheapest = totals[0] ?? null

  return {
    activities: { lo:actLo, hi:actHi },
    stay: cheapest ? { lo:cheapest.lo, hi:cheapest.hi } : null,
    total: { lo: actLo + (cheapest?.lo ?? 0), hi: actHi + (cheapest?.hi ?? 0) },
  }
}

/* ============================================================
   BUDGET
   Three levers, each a real choice about the trip.

   `sleep` isn't priced in the data: it picks the cheapest, middle
   or dearest stay AT EACH STOP and sums the real prices. That's
   why it can't invert the way tier names did — dearest is dearest
   by construction, even where a location has no splurge option.
   ============================================================ */

/* the stays at one stop, cheapest first, with split-stay nights honoured */
function pricedStays(location, stop){
  return location.stays
    .map(st => {
      const nights = st.nights != null ? st.nights : (stop.nights || 0)
      return { st, nights, lo: st.priceNightEUR[0] * nights, hi: st.priceNightEUR[1] * nights }
    })
    .filter(x => x.nights > 0)
    .sort((a, b) => a.lo - b.lo)
}

const RANK = { cheap: 0, middle: 1, dear: 2 }

/* which hotel each sleep option actually means, per stop */
export function stayChoices(itinerary, sleepId = 'cheap'){
  const out = []
  for(const stop of itinerary.stops){
    const loc = TRIP.byId[stop.locationId]
    if(!loc) continue
    const priced = pricedStays(loc, stop)
    if(!priced.length) continue
    const i = Math.min(RANK[sleepId] ?? 0, priced.length - 1)
    out.push({ stop, location: loc, ...priced[i] })
  }
  return out
}

export function tripBudget(itinerary, choice = {}){
  const model = TRIP.data.budget
  if(!model?.levers) return { rows: [], total: { lo:0, hi:0 } }

  const pick = (key) => {
    const lever = model.levers[key]
    const id = choice[key] ?? lever.default
    return lever.options.find(o => o.id === id) ?? lever.options[0]
  }

  const nights = itinerary.stops.reduce((n, s) => n + (s.nights || 0), 0)

  /* stays: the actual sum of the chosen hotels */
  const stays = stayChoices(itinerary, (choice.sleep ?? model.levers.sleep.default))
  const stayLo = stays.reduce((n, x) => n + x.lo, 0)
  const stayHi = stays.reduce((n, x) => n + x.hi, 0)

  /* activities: everything priced in the itinerary, not a choice */
  let actLo = 0, actHi = 0
  for(const stop of itinerary.stops){
    for(const a of TRIP.byId[stop.locationId]?.thingsToDo ?? []){
      actLo += a.priceEUR?.[0] ?? 0
      actHi += a.priceEUR?.[1] ?? 0
    }
  }

  const eat  = pick('eat')
  const move = pick('move')
  const eatMul = model.levers.eat.perNight ? nights : 1

  const rows = [
    { id:'stays',      label:'Stays',      lo:stayLo,               hi:stayHi },
    ...(model.fixed ?? []).map(f => ({ id:f.id, label:f.label, lo:f.eur[0], hi:f.eur[1] })),
    { id:'food',       label:'Food',       lo:eat.eur[0]*eatMul,    hi:eat.eur[1]*eatMul },
    { id:'transport',  label:'Transport',  lo:move.eur[0],          hi:move.eur[1] },
    { id:'activities', label:'Activities', lo:actLo,                hi:actHi },
  ]

  return {
    rows, stays,
    chosen: { sleep: choice.sleep ?? model.levers.sleep.default, eat: eat.id, move: move.id },
    nights,
    total: {
      lo: rows.reduce((n, r) => n + r.lo, 0),
      hi: rows.reduce((n, r) => n + r.hi, 0),
    },
  }
}

/* what a sleep option costs, for the lever's own price label */
export function sleepOptionCost(itinerary, id){
  const s = stayChoices(itinerary, id)
  return { lo: s.reduce((n,x)=>n+x.lo,0), hi: s.reduce((n,x)=>n+x.hi,0) }
}

/* running arrival/departure dates per stop, when the itinerary is dated */
export function stopDates(itinerary){
  const out = {}
  if(!itinerary.dateRange?.start) return out
  const d = new Date(itinerary.dateRange.start + 'T00:00:00')
  for(const s of itinerary.stops){
    const from = new Date(d)
    if(s.nights) d.setDate(d.getDate() + s.nights)
    out[s.locationId] = { from, to:new Date(d) }
  }
  return out
}

export const eur = n => '\u20AC' + Math.round(n).toLocaleString('en-US')
