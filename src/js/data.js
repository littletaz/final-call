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

/* Sunshine Formula / Scribble Note (the two hand-lettered display faces —
   see artDirection.fonts.script/.hand) don't carry accented glyphs, so any
   text set in them needs to lose its accents on 'e' or it falls back to the
   browser's default face mid-word. A trip using the Google-hosted fallback
   faces (no `src`, e.g. japon-2026) doesn't have this problem, so this is
   keyed off the active trip's own font declaration rather than applied
   everywhere. */
export function handFontHasNoAccents(){
  return !!TRIP.data?.artDirection?.fonts?.hand?.src
}
export function stripEAccents(s){
  return s.replace(/[éèêë]/g, 'e').replace(/[ÉÈÊË]/g, 'E')
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

/* A booking link carrying the actual dates, so the search opens on the right
   nights instead of today's. `group_adults` is separate from the flight
   passenger count on purpose — the flights are booked individually, the room
   is shared.

   A stay with its own `nights` (a stop split across two bases) is checked in on
   the stop's arrival date for that many nights. The LENGTH is always right; the
   position within the stop is a guess, since the data doesn't say which half
   comes first. */
export function bookingUrl(stay, stop, dates, adults = 2){
  if(!stay.bookingUrl) return null
  const d = dates?.[stop.locationId]
  if(!d?.from) return stay.bookingUrl

  const iso = x => x.toISOString().slice(0, 10)
  const nights = stayNights(stay, stop)
  const checkin = d.from
  const checkout = new Date(checkin)
  checkout.setDate(checkout.getDate() + Math.max(1, nights))

  const u = new URL(stay.bookingUrl)
  u.searchParams.set('checkin', iso(checkin))
  u.searchParams.set('checkout', iso(checkout))
  u.searchParams.set('group_adults', String(adults))
  u.searchParams.set('group_children', '0')
  u.searchParams.set('no_rooms', '1')
  return u.toString()
}

export const eur = n => '\u20AC' + Math.round(n).toLocaleString('en-US')

/* The departure cities a trip offers, and the one to start on. Everything
   reads the list through here so the ledger, the control above it and the
   validator can never disagree about what a valid origin is. An unknown id
   (a stale value, a trip that dropped a city) falls back to the declared
   default rather than pricing nothing. */
export function tripOrigins(){
  return TRIP.data.budget?.origins ?? []
}
export function resolveOrigin(id){
  const list = tripOrigins()
  if(!list.length) return null
  return list.find(o => o.id === id)
      ?? list.find(o => o.id === TRIP.data.budget?.defaultOriginId)
      ?? list[0]
}

/* ============================================================
   LEDGER BUDGET (v2)
   A flat, itemized replacement for the old lever/comfort-tier model
   (see final-call-v1-vs-v2-spec.md): one group per BASE stop, bundling
   that stop's hotel + every thingsToDo entry for it and its spurs, plus
   any `budget.fixed` line tagged to it via `locationId`. No formula, no
   multiplier \u2014 every number here is one already authored on a location
   or in budget.fixed.
   ============================================================ */
export function buildLedger(itinerary, tier = 'budget', originId = null){
  const stops = itinerary.stops ?? []
  const bases = stops.filter(s => !s.spur)
  const budget = TRIP.data.budget ?? {}
  /* Trip-wide lines, then the itinerary's own. Internal flights belong to the
     ITINERARY, not the trip: the same city can be flown into on one variant
     and driven to on another (Christchurch is), so a trip-level line keyed
     only by locationId would bill a flight nobody takes. */
  const fixed = [...(budget.fixed ?? []), ...(itinerary.fixed ?? [])]
  const adults = TRIP.data.cta?.roomAdults ?? 3

  /* The long-haul fare is the one line that depends on WHO is reading the
     page — the three of us leave from three different cities. It is filed
     under the stop we fly into (budget.originLocationId, defaulting to the
     first base) so it lands in that group like any other line. */
  const origin = resolveOrigin(originId)
  const originAt = budget.originLocationId ?? bases[0]?.locationId

  const groups = bases.map(base => {
    const loc = TRIP.byId[base.locationId]
    const spurIds = stops.filter(s => s.spur && s.spurFrom === base.locationId).map(s => s.locationId)
    const items = []

    if(base.nights > 0 && loc?.stays?.length){
      const stay = loc.stays.find(s => s.tier === tier) ?? loc.stays[0]
      items.push({
        label: `H\u00F4tel ${loc.name?.en ?? base.locationId} \u00B7 ${base.nights} nuit${base.nights > 1 ? 's' : ''}, partag\u00E9 \u00E0 ${adults}`,
        lo: stay.priceNightEUR[0] * base.nights,
        hi: stay.priceNightEUR[1] * base.nights,
      })
    }

    for(const id of [base.locationId, ...spurIds]){
      for(const t of TRIP.byId[id]?.thingsToDo ?? []){
        const [lo, hi] = t.priceEUR ?? [0, 0]
        items.push({ label: t.title, lo, hi, free: !lo && !hi })
      }
    }

    if(origin && base.locationId === originAt)
      items.push({
        label: `Vols long-courriers (aller-retour, ${origin.label})`,
        lo: origin.eur[0], hi: origin.eur[1],
      })

    for(const f of fixed.filter(f => f.locationId === base.locationId))
      items.push({ label: f.label, lo: f.eur[0], hi: f.eur[1] })

    return { locationId: base.locationId, label: loc?.name?.en ?? base.locationId, items }
  })

  const allItems = groups.flatMap(g => g.items)
  return {
    groups,
    total: {
      lo: allItems.reduce((n, i) => n + i.lo, 0),
      hi: allItems.reduce((n, i) => n + i.hi, 0),
    },
  }
}
