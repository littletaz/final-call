#!/usr/bin/env node
/* ============================================================
   REMAP CANVAS

   Every y coordinate in a trip file is a fraction of the map
   image. Change the image's height and those fractions point
   somewhere else. This rewrites them so they keep pointing at
   the same place on the artwork.

     node scripts/remap-canvas.mjs public/trips/japon-2026.json \
          --old 3840x2556 --new 3840x3840 --top 642

   --top is how many pixels of NEW canvas sit above where the old
   artwork begins. Omit it and the old artwork is assumed centred
   vertically, i.e. --top (newH - oldH) / 2.

   Add --dry to preview without writing.
   ============================================================ */

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const argv = process.argv.slice(2)
const file = argv.find(a => !a.startsWith('--'))
const flag = n => { const i = argv.indexOf('--' + n); return i === -1 ? null : argv[i + 1] }
const dry  = argv.includes('--dry')

if(!file){
  console.error('usage: node scripts/remap-canvas.mjs <trip.json> --old WxH --new WxH [--top px] [--dry]')
  process.exit(1)
}

const parse = s => {
  const m = /^(\d+)x(\d+)$/.exec(s || '')
  if(!m) throw new Error(`expected WxH, got "${s}"`)
  return { w:+m[1], h:+m[2] }
}

const path = resolve(file)
const trip = JSON.parse(readFileSync(path, 'utf8'))

const oldSize = flag('old') ? parse(flag('old')) : trip.map.baseSize
const newSize = parse(flag('new'))
const top = flag('top') != null ? +flag('top') : (newSize.h - oldSize.h) / 2
const left = flag('left') != null ? +flag('left') : (newSize.w - oldSize.w) / 2

/* a fraction of the old image -> the same point as a fraction of the new one */
const remapY = v => (top  + v * oldSize.h) / newSize.h
const remapX = u => (left + u * oldSize.w) / newSize.w

console.log(`\n  old canvas  ${oldSize.w}x${oldSize.h}`)
console.log(`  new canvas  ${newSize.w}x${newSize.h}`)
console.log(`  old artwork sits at  left ${left}px, top ${top}px  of the new canvas`)
console.log(`  vertical scale ${(oldSize.h / newSize.h).toFixed(4)}\n`)

const rows = []
for(const l of trip.locations){
  const c = l.coordinates
  if(c.onInset) { rows.push([l.id + ' (inset)', c.x, c.y, c.x, c.y, 'unchanged']); continue }
  const nx = +remapX(c.x).toFixed(4)
  const ny = +remapY(c.y).toFixed(4)
  rows.push([l.id, c.x, c.y, nx, ny, ''])
  if(!dry){ c.x = nx; c.y = ny }
}

const ins = trip.map.inset
if(ins){
  const ny = +remapY(ins.y).toFixed(4)
  const nw = +(ins.w * oldSize.w / newSize.w).toFixed(4)
  rows.push(['map.inset', ins.x ?? '—', ins.y, ins.x ?? '—', ny, `width ${ins.w} -> ${nw}`])
  if(!dry){ ins.y = ny; ins.w = nw }
}

const pad = (s, n) => String(s).padEnd(n)
console.log('  ' + pad('id', 24) + pad('old x,y', 20) + pad('new x,y', 20) + 'note')
console.log('  ' + '-'.repeat(74))
for(const [id, ox, oy, nx, ny, note] of rows)
  console.log('  ' + pad(id, 24) + pad(`${ox}, ${oy}`, 20) + pad(`${nx}, ${ny}`, 20) + note)

if(!dry){
  trip.map.baseSize = newSize
  writeFileSync(path, JSON.stringify(trip, null, 2) + '\n')
  console.log(`\n  written: ${file}`)
  console.log('  baseSize updated to', `${newSize.w}x${newSize.h}`)
} else {
  console.log('\n  --dry: nothing written')
}

/* clouds and waves live in code, not data, so print their new values to paste */
console.log('\n  Cloud/wave y values for src/js/map.js:')
const OLD_CLOUD_Y = [25.5, 18.5, 41.0, 15.0, 29.0, 47.0, 56.0, 62.0]
const OLD_WAVE_Y  = [66.0, 19.0, 24.0, 74.0, 70.0, 56.0, 33.0]
const fmt = arr => arr.map(v => (remapY(v / 100) * 100).toFixed(1)).join(', ')
console.log('    clouds:', fmt(OLD_CLOUD_Y))
console.log('    waves :', fmt(OLD_WAVE_Y))
console.log('\n  These assume the artwork was only padded, not redrawn. If you moved')
console.log('  things around, use the CALIBRATE panel for pins and adjust the sky by eye.\n')
