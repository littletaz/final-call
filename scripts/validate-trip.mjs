#!/usr/bin/env node
/* ============================================================
   TRIP FILE VALIDATOR

     npm run validate                  → every file in public/trips
     npm run validate -- path/to.json  → one file

   Catches the mistakes that are easy to make by hand or to get
   subtly wrong when a file is generated in another chat.
   ============================================================ */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { basename, dirname, join, resolve } from 'path'

const ROOT   = resolve(process.cwd())
const TRIPS  = join(ROOT, 'public', 'trips')
const PUBLIC = join(ROOT, 'public')

/* asset paths inside a trip file are relative to that file's own folder */
const inTrip = (tripPath, p) =>
  p.startsWith('shared/') ? join(PUBLIC, p) : join(dirname(tripPath), p)

const ARRIVE = ['flight', 'surface']

let errors = 0, warnings = 0

/* enough header parsing to get width/height without pulling in a dependency */
function imageSize(path){
  try{
    const b = readFileSync(path)
    if(b.length > 24 && b.toString('ascii', 1, 4) === 'PNG')
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
    if(b[0] === 0xFF && b[1] === 0xD8){                       /* JPEG */
      let i = 2
      while(i < b.length){
        if(b[i] !== 0xFF) { i++; continue }
        const marker = b[i + 1]
        if(marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker))
          return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }
        i += 2 + b.readUInt16BE(i + 2)
      }
    }
  }catch(e){}
  return null
}

const err  = (file, msg) => { errors++;   console.log(`  \x1b[31m✗\x1b[0m ${msg}`) }
const warn = (file, msg) => { warnings++; console.log(`  \x1b[33m!\x1b[0m ${msg}`) }
const ok   = msg          => console.log(`  \x1b[32m✓\x1b[0m ${msg}`)

function validateTrip(path){
  const name = `${basename(dirname(path))}/${basename(path)}`
  console.log(`\n\x1b[1m${name}\x1b[0m`)

  let t
  try {
    t = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    err(name, `invalid JSON — ${e.message}`)
    return
  }

  /* ---------- top level ---------- */
  for(const k of ['id', 'title', 'defaultItineraryId', 'map', 'locations', 'itineraries'])
    if(t[k] == null) err(name, `missing required key: ${k}`)

  /* a trip is a folder named after its id, containing trip.json */
  const folder = basename(dirname(path))
  if(t.id && folder !== t.id)
    warn(name, `folder "${folder}" doesn't match id "${t.id}" — they should match`)

  if(!Array.isArray(t.locations) || !t.locations.length){ err(name, 'locations must be a non-empty array'); return }
  if(!Array.isArray(t.itineraries) || !t.itineraries.length){ err(name, 'itineraries must be a non-empty array'); return }

  /* ---------- locations ---------- */
  const ids = new Set()
  for(const l of t.locations){
    const tag = l.id ?? '(no id)'
    if(!l.id) err(name, 'a location has no id')
    if(ids.has(l.id)) err(name, `duplicate location id: ${l.id}`)
    ids.add(l.id)

    if(!l.name?.en) err(name, `${tag}: name.en is required`)
    /* epithet was dropped from the card design; only subtitle is still used */
    if(!l.subtitle) warn(name, `${tag}: subtitle is empty`)

    const c = l.coordinates
    if(!c || typeof c.x !== 'number' || typeof c.y !== 'number')
      err(name, `${tag}: coordinates.x/y must be numbers`)
    else if(c.x < 0 || c.x > 1 || c.y < 0 || c.y > 1)
      err(name, `${tag}: coordinates must be 0–1 (got ${c.x}, ${c.y})`)

    if(c?.onInset && c.onInset !== t.map?.inset?.id)
      err(name, `${tag}: onInset "${c.onInset}" doesn't match map.inset.id "${t.map?.inset?.id}"`)

    /* the card renders exactly three */
    if(!Array.isArray(l.stays) || l.stays.length < 3)
      err(name, `${tag}: needs at least 3 stays (has ${l.stays?.length ?? 0})`)

    for(const s of l.stays ?? []){
      if(!s.name) err(name, `${tag}: a stay has no name`)
      /* `tier` is only the label printed on the card. The budget's sleep lever
         picks cheapest / middle / dearest BY PRICE, so the vocabulary is free —
         what matters is that there are exactly three to choose between. */
      if(!s.tier) warn(name, `${tag}: stay "${s.name}" has no tier label`)
      const p = s.priceNightEUR
      if(!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number')
        err(name, `${tag}: stay "${s.name}" priceNightEUR must be [lo, hi]`)
      else if(p[0] > p[1])
        err(name, `${tag}: stay "${s.name}" price lo > hi (${p[0]} > ${p[1]})`)
      if(s.nights != null && (!Number.isInteger(s.nights) || s.nights < 0))
        err(name, `${tag}: stay "${s.name}" nights must be a non-negative integer`)
      /* the card links straight out to this, so a bad value is a dead link */
      if(s.bookingUrl == null)
        warn(name, `${tag}: stay "${s.name}" has no bookingUrl — it won't be clickable`)
      else if(!/^https:\/\/\S+$/.test(s.bookingUrl))
        err(name, `${tag}: stay "${s.name}" bookingUrl must be an absolute https URL`)
    }

    for(const a of l.thingsToDo ?? []){
      if(typeof a === 'string'){
        err(name, `${tag}: thingsToDo must be objects, not strings (found "${a}")`)
        continue
      }
      if(!a.title) err(name, `${tag}: an activity has no title`)
      if(a.priceEUR != null){
        const p = a.priceEUR
        if(!Array.isArray(p) || p.length !== 2)
          err(name, `${tag}: activity "${a.title}" priceEUR must be [lo, hi]`)
        else if(p[0] > p[1])
          err(name, `${tag}: activity "${a.title}" price lo > hi`)
      }
    }
    if(l.kanjiChips && l.kanjiChips.length && l.kanjiChips.length !== 2)
      warn(name, `${tag}: kanjiChips should be exactly 2 (has ${l.kanjiChips.length})`)
  }
  ok(`${t.locations.length} locations`)

  /* ---------- itineraries ---------- */
  const itIds = new Set()
  for(const it of t.itineraries){
    const tag = it.id ?? '(no id)'
    if(!it.id) err(name, 'an itinerary has no id')
    if(itIds.has(it.id)) err(name, `duplicate itinerary id: ${it.id}`)
    itIds.add(it.id)

    if(!Array.isArray(it.stops) || !it.stops.length){
      err(name, `${tag}: stops must be a non-empty array`)
      continue
    }

    for(const s of it.stops){
      if(!ids.has(s.locationId))
        err(name, `${tag}: unknown locationId "${s.locationId}"`)
      if(s.arriveBy && !ARRIVE.includes(s.arriveBy))
        err(name, `${tag}: arriveBy "${s.arriveBy}" must be ${ARRIVE.join(' | ')}`)
      if(typeof s.nights !== 'number' || s.nights < 0)
        err(name, `${tag}: stop "${s.locationId}" nights must be a number ≥ 0`)
      if(s.spur && s.nights !== 0)
        err(name, `${tag}: spur "${s.locationId}" must have nights: 0 (has ${s.nights})`)
      if(s.spur && s.spurFrom && !ids.has(s.spurFrom))
        err(name, `${tag}: spurFrom "${s.spurFrom}" is not a known location`)
      if(!s.spur && s.nights === 0)
        warn(name, `${tag}: "${s.locationId}" has 0 nights but isn't marked spur:true`)
    }

    /* the rule that's easiest to get wrong */
    const nights = it.stops.reduce((n, s) => n + (s.nights || 0), 0)
    if(typeof it.days !== 'number')
      err(name, `${tag}: days is required`)
    else if(nights !== it.days - 1)
      err(name, `${tag}: nights (${nights}) must equal days - 1 (${it.days - 1}). ` +
                `Either set days: ${nights + 1}, or adjust the stops.`)

    const dr = it.dateRange
    if(dr?.start && dr?.end){
      const a = new Date(dr.start), b = new Date(dr.end)
      if(isNaN(a) || isNaN(b)) err(name, `${tag}: dateRange must be ISO YYYY-MM-DD`)
      else {
        const span = Math.round((b - a) / 86400000)
        if(span !== nights)
          err(name, `${tag}: dateRange spans ${span} nights but stops total ${nights}`)
      }
    } else if(!it.periodLabel && !it.periodDisplay){
      warn(name, `${tag}: no dateRange and no periodLabel — the selector will show nothing`)
    }

    if(it.flights == null) warn(name, `${tag}: no flights count — dataviz will show 0`)
  }
  ok(`${t.itineraries.length} itineraries`)

  if(!itIds.has(t.defaultItineraryId))
    err(name, `defaultItineraryId "${t.defaultItineraryId}" doesn't match any itinerary`)

  /* ---------- map + assets ---------- */
  /* A WARNING, not an error. A trip should be buildable before its artwork
     exists — the page draws a hatched box naming each missing file, so you can
     lay out a new trip and see what's still to draw. */
  const checkAsset = (p, label) => {
    if(!p) return false
    if(!existsSync(inTrip(path, p))){
      warn(name, `${label} not found: ${p} — the page will show a placeholder naming it`)
      return false
    }
    return true
  }
  checkAsset(t.map?.pin || 'pin.svg', 'map.pin')
  checkAsset(t.map?.logo || 'logo.png', 'map.logo')

  /* sprites moved into the data, so they're worth checking */
  for(const [key, arr] of [['clouds', t.map?.clouds], ['waves', t.map?.waves]]){
    for(const [i, sp] of (arr ?? []).entries()){
      if(!sp.file){ err(name, `map.${key}[${i}]: file is required`); continue }
      checkAsset(sp.file, `map.${key}[${i}].file`)
      if(key === 'waves'){
        /* waves are placed on the map, so they need coordinates like pins */
        if(typeof sp.x !== 'number' || typeof sp.y !== 'number')
          err(name, `map.waves[${i}]: x/y are required (fractions of the map image)`)
        else if(sp.x < 0 || sp.x > 1 || sp.y < 0 || sp.y > 1)
          err(name, `map.waves[${i}]: x/y must be 0-1 (got ${sp.x}, ${sp.y})`)
      } else {
        /* clouds drift across the viewport, so x + travel must clear the edge */
        if(sp.x != null && sp.travel != null && sp.x + sp.travel <= 100)
          err(name, `map.clouds[${i}]: x + travel is ${sp.x + sp.travel} — must exceed 100, ` +
                    `or the loop reset happens on screen`)
      }
    }
  }

  /* per-itinerary map variants must match the base dimensions */
  for(const it of t.itineraries ?? []){
    if(it.map?.base) checkAsset(it.map.base, `itineraries.${it.id}.map.base`)
  }
  const baseOk = checkAsset(t.map?.base, 'map.base')
  checkAsset(t.map?.inset?.src, 'map.inset.src')

  /* Every pin coordinate is a fraction of this image, so a baseSize that
     disagrees with the file silently moves every pin. Read the real size
     straight out of the PNG/JPEG header. */
  if(baseOk && t.map?.baseSize){
    const real = imageSize(inTrip(path, t.map.base))
    if(!real) warn(name, `couldn't read dimensions of ${t.map.base}`)
    else if(real.w !== t.map.baseSize.w || real.h !== t.map.baseSize.h)
      err(name, `map.baseSize is ${t.map.baseSize.w}x${t.map.baseSize.h} but ` +
                `${t.map.base} is actually ${real.w}x${real.h}. ` +
                `Run: npm run remap -- <this file> --new ${real.w}x${real.h}`)
  }

  if(t.map?.inset){
    const i = t.map.inset
    if(!ids.has(i.forLocationId))
      err(name, `map.inset.forLocationId "${i.forLocationId}" is not a known location`)
    for(const k of ['x', 'y', 'w'])
      if(typeof i[k] !== 'number') err(name, `map.inset.${k} must be a number`)
  }
  if(t.map?._calibrated === false)
    warn(name, 'coordinates are uncalibrated (map._calibrated is false)')

  const crop = t.map?.cropBottom
  if(crop != null){
    if(typeof crop !== 'number' || crop < 0 || crop >= 1)
      err(name, `map.cropBottom must be a number between 0 and 1 (got ${crop})`)
    else {
      /* a pin below the cut would be scrolled out of existence */
      const below = (t.locations ?? [])
        .filter(l => !l.coordinates?.onInset && l.coordinates?.y > 1 - crop)
        .map(l => `${l.id} (y ${l.coordinates.y})`)
      if(below.length)
        err(name, `map.cropBottom ${crop} hides everything below y ${(1-crop).toFixed(3)}, ` +
                  `but these pins sit there: ${below.join(', ')}`)
    }
  }
  /* fonts are per-trip; a typo means silently falling back forever */
  const fonts = t.artDirection?.fonts
  if(!fonts) warn(name, 'no artDirection.fonts — the page will use fallback faces')
  else for(const [role, f] of Object.entries(fonts)){
    if(role.startsWith('_')) continue
    if(!f?.family){ err(name, `artDirection.fonts.${role}: family is required`); continue }
    /* No google and no src is fine IF there's a fallback stack — that's a system
       font, which needs no loading. Only flag it when there's nothing to fall
       back to either. */
    if(!f.google && !f.src && !f.fallback)
      err(name, `artDirection.fonts.${role} ("${f.family}") has no google, no src `
        + `and no fallback — nothing will load and nothing will substitute`)
    if(f.src && !existsSync(inTrip(path, f.src)))
      err(name, `artDirection.fonts.${role}: file not found — ${f.src} (relative to the trip folder)`)
    if(f.src && !/\.woff2$/.test(f.src))
      warn(name, `artDirection.fonts.${role}: ${f.src} isn't woff2 — roughly half the size for the same outlines`)
    if(!f.fallback)
      warn(name, `artDirection.fonts.${role}: no fallback stack — text is unstyled until the face loads`)
  }

  if(t.map?.backgroundColor && !/^#[0-9a-fA-F]{6}$/.test(t.map.backgroundColor))
    err(name, `map.backgroundColor "${t.map.backgroundColor}" must be a 6-digit hex`)
  if(!t.map?.backgroundColor)
    warn(name, 'no map.backgroundColor — falls back to the --sea token, which may not match the artwork')

  /* ---------- budget ---------- */
  if(t.budget){
    const tierIds = (t.budget.comfortTiers ?? []).map(x => x.id)
    if(t.budget.defaultTierId && !tierIds.includes(t.budget.defaultTierId))
      err(name, `budget.defaultTierId "${t.budget.defaultTierId}" isn't in comfortTiers`)
    for(const c of t.budget.categories ?? []){
      const b = c.baseEUR
      if(!Array.isArray(b) || b.length !== 2) err(name, `budget "${c.id}": baseEUR must be [lo, hi]`)
      else if(b[0] > b[1]) err(name, `budget "${c.id}": lo > hi`)
    }
  } else warn(name, 'no budget block — the footer will fall back to defaults')

  /* ---------- cta / flight search ---------- */
  const fs = t.cta?.flightSearch
  if(!t.cta) warn(name, 'no cta block — the footer button will be missing')
  else if(!fs) warn(name, 'no cta.flightSearch — the button will be disabled')
  else {
    const PROVIDERS = ['kayak', 'momondo', 'google']
    if(fs.provider && !PROVIDERS.includes(fs.provider))
      err(name, `cta.flightSearch.provider "${fs.provider}" must be ${PROVIDERS.join(' | ')}`)
    if(fs.provider === 'google' && (fs.legs?.length ?? 0) > 1)
      warn(name, 'provider "google" can only search the first leg — use kayak or momondo for multi-city')

    if(!Array.isArray(fs.legs) || !fs.legs.length)
      err(name, 'cta.flightSearch.legs must be a non-empty array')
    else fs.legs.forEach((l, i) => {
      const at = `cta.flightSearch.legs[${i}]`
      for(const k of ['from', 'to']){
        if(!l[k]) err(name, `${at}: ${k} is required`)
        else if(!/^[A-Z]{3}$/.test(l[k])) err(name, `${at}: ${k} "${l[k]}" should be a 3-letter IATA code`)
      }
      const ref = l.dateFrom ?? l.date
      if(!ref) err(name, `${at}: needs dateFrom ("itineraryStart" | "itineraryEnd") or an explicit date`)
      else if(!['itineraryStart', 'itineraryEnd'].includes(ref) && !/^\d{4}-\d{2}-\d{2}$/.test(ref))
        err(name, `${at}: "${ref}" must be itineraryStart, itineraryEnd, or YYYY-MM-DD`)
    })

    if(fs.passengers != null && (!Number.isInteger(fs.passengers) || fs.passengers < 1))
      err(name, 'cta.flightSearch.passengers must be a positive integer')
  }
}

/* ---------- registry ---------- */
function validateRegistry(){
  const path = join(TRIPS, 'index.json')
  console.log('\n\x1b[1mindex.json\x1b[0m')
  if(!existsSync(path)){ err('index.json', 'missing public/trips/index.json'); return [] }

  let reg
  try { reg = JSON.parse(readFileSync(path, 'utf8')) }
  catch(e){ err('index.json', `invalid JSON — ${e.message}`); return [] }

  const files = []
  for(const t of reg.trips ?? []){
    if(!t.id || !t.file){ err('index.json', 'each trip needs id + file'); continue }
    const p = join(PUBLIC, t.file)
    if(!existsSync(p)) err('index.json', `${t.id}: file not found — public/${t.file}`)
    else files.push(p)
  }
  if(reg.defaultTripId && !(reg.trips ?? []).some(t => t.id === reg.defaultTripId))
    err('index.json', `defaultTripId "${reg.defaultTripId}" isn't listed`)

  ok(`${(reg.trips ?? []).length} trips registered`)

  /* anything sitting in the folder but not registered is invisible to the app */
  const onDisk = readdirSync(TRIPS).filter(f => f.endsWith('.json') && f !== 'index.json')
  const listed = new Set((reg.trips ?? []).map(t => basename(t.file)))
  for(const f of onDisk)
    if(!listed.has(f)) warn('index.json', `${f} exists but isn't in index.json — it won't be loadable`)

  return files
}

/* ---------- run ---------- */
const arg = process.argv[2]
if(arg){
  validateTrip(resolve(arg))
} else {
  for(const f of validateRegistry()) validateTrip(f)
}

console.log(`\n${errors ? '\x1b[31m' : '\x1b[32m'}${errors} error${errors === 1 ? '' : 's'}\x1b[0m, ` +
            `\x1b[33m${warnings} warning${warnings === 1 ? '' : 's'}\x1b[0m`)
process.exit(errors ? 1 : 0)
