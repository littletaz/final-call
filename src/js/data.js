import { asset } from './paths.js'

/* ============================================================
   DATA
   One file per trip. `trips/index.json` is the registry; each
   trip file carries its own manifest, locations and itineraries.
   Load a specific trip with ?trip=<id>.
   ============================================================ */

export const TRIP = {
  registry: null,
  data: null,        /* the whole trip file */
  byId: {},          /* locationId -> location */
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

/* Whole-trip budget for the footer. Stays and activities are summed from the
   itinerary where possible and fall back to the model's base figures. */
export function tripBudget(itinerary, tierId){
  const model = TRIP.data.budget
  const tier  = model.comfortTiers.find(t => t.id === tierId) || model.comfortTiers[0]

  let stayLo = 0, stayHi = 0, actLo = 0, actHi = 0
  for(const stop of itinerary.stops){
    const loc = TRIP.byId[stop.locationId]
    if(!loc) continue
    const b = cardBudget(loc, stop)
    if(b.stay){ stayLo += b.stay.lo; stayHi += b.stay.hi }
    actLo += b.activities.lo; actHi += b.activities.hi
  }

  const rows = model.categories.map(c => {
    let [lo, hi] = c.baseEUR
    if(c.id === 'stays'      && stayHi > 0){ lo = stayLo; hi = stayHi }
    if(c.id === 'activities' && actHi  > 0){ lo = actLo;  hi = actHi  }
    return { id:c.id, label:c.label, lo:lo * tier.multiplier, hi:hi * tier.multiplier }
  })

  return {
    tier, rows,
    total: {
      lo: rows.reduce((n, r) => n + r.lo, 0),
      hi: rows.reduce((n, r) => n + r.hi, 0),
    },
  }
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
