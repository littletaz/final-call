import './styles/tokens.css'
import './styles/reset.css'
import './styles/flapboard.css'
import './styles/wall.css'
import { Wall, SCRIPT } from './js/wall.js'
import { asset } from './js/paths.js'

/* ============================================================
   THE NO PAGE
   A wall of flaps that changes its mind about you.

   It's a page again rather than a section of the footer: as a
   fixed layer behind the trip it competed with the card parallax
   and the map, and the reveal was never smooth. On its own page
   it has the frame to itself.
   ============================================================ */

const SWAP = 5000        /* how long each message holds */

const wall = new Wall(document.getElementById('wall'), { rows: 5 })
wall.build(SCRIPT.no)

/* back and forth, forever */
let i = 0
wall.messageBoard && setInterval(() => {
  i++
  wall.say(i % 2 ? SCRIPT.taunt : SCRIPT.no)
}, SWAP)

/* Both buttons keep whichever trip you came from, so ?trip= survives the
   detour. Without it, saying no to Australia would send you back to Japan. */
const TRIP_ID = new URLSearchParams(location.search).get('trip')
const back = document.getElementById('back-to-map')
if(back && TRIP_ID) back.href = `./trip.html?trip=${encodeURIComponent(TRIP_ID)}`

/* the change of heart goes straight to the flight search */
;(async () => {
  const btn = document.getElementById('changed-mind')
  try{
    const reg = await (await fetch(asset('trips/index.json'))).json()
    const id  = TRIP_ID || reg.defaultTripId || reg.trips?.[0]?.id
    const entry = reg.trips.find(t => t.id === id) || reg.trips[0]
    const trip  = await (await fetch(asset(entry.file))).json()

    const fs = trip?.cta?.flightSearch
    const it = trip.itineraries.find(x => x.id === trip.defaultItineraryId) || trip.itineraries[0]
    const dr = it?.dateRange || {}
    const legs = (fs?.legs ?? []).map(l => ({
      from:l.from, to:l.to,
      date: l.dateFrom === 'itineraryStart' ? dr.start
          : l.dateFrom === 'itineraryEnd'   ? dr.end : l.date,
    })).filter(l => l.from && l.to && l.date)

    if(legs.length){
      const path = legs.map(l => `${l.from}-${l.to}/${l.date}`).join('/')
      const pax  = fs.passengers > 1 ? `/${fs.passengers}adults` : ''
      btn.href = `https://www.kayak.com/flights/${path}${pax}?sort=bestflight_a`
      btn.target = '_blank'; btn.rel = 'noopener noreferrer'
    } else if(TRIP_ID){
      btn.href = `./trip.html?trip=${encodeURIComponent(TRIP_ID)}`
    }
  }catch(e){ console.error(e) }   /* the link falls back to the trip page */
})()

let t
addEventListener('resize', () => {
  clearTimeout(t)
  t = setTimeout(() => { wall.destroy(); wall.build(SCRIPT.no) }, 250)
})
