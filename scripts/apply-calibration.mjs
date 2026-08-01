#!/usr/bin/env node
/* ============================================================
   APPLY CALIBRATION

   Takes the JSON from the CALIBRATE panel's COPY JSON button and
   writes it into a trip file, so you don't hand-edit a dozen
   coordinate blocks.

     # save the clipboard to a file, then:
     npm run calibrate:apply -- public/trips/japon-2026.json calib.json

     # or pipe it straight in:
     pbpaste | npm run calibrate:apply -- public/trips/japon-2026.json

   Also sets map._calibrated to true, and updates baseSize to the
   real image dimensions if they've drifted.

   Add --dry to preview.
   ============================================================ */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, join, dirname } from 'path'

const argv = process.argv.slice(2)
const dry  = argv.includes('--dry')
const args = argv.filter(a => !a.startsWith('--'))
const [tripPath, calibPath] = args

if(!tripPath){
  console.error('usage: node scripts/apply-calibration.mjs <trip.json> [calibration.json] [--dry]')
  console.error('       (omit the second file to read the calibration from stdin)')
  process.exit(1)
}

/* ---- read the calibration ---- */
let raw
if(calibPath){
  raw = readFileSync(resolve(calibPath), 'utf8')
} else {
  try { raw = readFileSync(0, 'utf8') }
  catch { console.error('nothing on stdin — pass a file or pipe the JSON in'); process.exit(1) }
}
if(!raw.trim()){ console.error('empty calibration input'); process.exit(1) }

let calib
try { calib = JSON.parse(raw) }
catch(e){ console.error('calibration is not valid JSON —', e.message); process.exit(1) }

/* Accepts the current export shape and the older comment-keyed one, so a
   calibration copied from a stale build still applies. */
const pinsKey = Object.keys(calib).find(k => Array.isArray(calib[k]))
if(!pinsKey){ console.error('no array of pins found in the calibration JSON'); process.exit(1) }
const pins = calib[pinsKey]

const inset = calib.map?.inset
           ?? calib[Object.keys(calib).find(k => /inset/i.test(k) && !Array.isArray(calib[k]))]
           ?? null

/* ---- read the trip ---- */
const path = resolve(tripPath)
const trip = JSON.parse(readFileSync(path, 'utf8'))
const byId = Object.fromEntries(trip.locations.map(l => [l.id, l]))

const pad = (s, n) => String(s).padEnd(n)
console.log('\n  ' + pad('location', 22) + pad('before', 20) + pad('after', 20) + 'note')
console.log('  ' + '-'.repeat(72))

let applied = 0, unknown = []
for(const p of pins){
  const id = p.id ?? p.locationId
  const loc = byId[id]
  if(!loc){ unknown.push(id); continue }
  const c = p.coordinates ?? p
  const before = `${loc.coordinates.x}, ${loc.coordinates.y}`
  const moved  = loc.coordinates.x !== c.x || loc.coordinates.y !== c.y
  console.log('  ' + pad(id, 22) + pad(before, 20) + pad(`${c.x}, ${c.y}`, 20) +
              (moved ? '' : 'unchanged'))
  if(!dry){
    loc.coordinates.x = c.x
    loc.coordinates.y = c.y
    if(c.onInset) loc.coordinates.onInset = c.onInset
    else delete loc.coordinates.onInset
  }
  applied++
}

if(inset && trip.map?.inset){
  const i = trip.map.inset
  console.log('  ' + pad('map.inset', 22) +
              pad(`${i.y}, w ${i.w}`, 20) + pad(`${inset.y}, w ${inset.w}`, 20))
  if(!dry){
    if(inset.y != null) i.y = inset.y
    if(inset.w != null) i.w = inset.w
  }
}

/* ---- keep baseSize honest while we're here ---- */
function imageSize(p){
  try{
    const b = readFileSync(p)
    if(b.length > 24 && b.toString('ascii',1,4) === 'PNG')
      return { w:b.readUInt32BE(16), h:b.readUInt32BE(20) }
  }catch(e){}
  return null
}
const publicDir = join(dirname(path), '..', '..', 'public')
const mapFile = trip.map?.base ? join(publicDir, trip.map.base) : null
if(mapFile && existsSync(mapFile)){
  const real = imageSize(mapFile)
  const dec = trip.map.baseSize
  if(real && dec && (real.w !== dec.w || real.h !== dec.h)){
    console.log(`\n  baseSize ${dec.w}x${dec.h} -> ${real.w}x${real.h} (from the image)`)
    if(!dry) trip.map.baseSize = real
  }
}

if(unknown.length)
  console.log(`\n  ignored ${unknown.length} unknown id(s): ${unknown.join(', ')}`)

if(dry){
  console.log('\n  --dry: nothing written\n')
} else {
  trip.map._calibrated = true
  delete trip.map._calibrationNote
  writeFileSync(path, JSON.stringify(trip, null, 2) + '\n')
  console.log(`\n  ${applied} pin(s) written to ${tripPath}`)
  console.log('  map._calibrated set to true')
  console.log('\n  NOW: click RESET in the CALIBRATE panel, or the values saved in')
  console.log('  localStorage will keep overriding the file and you won\'t see the change.\n')
}
