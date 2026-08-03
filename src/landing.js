import './styles/tokens.css'
import './styles/reset.css'
import './styles/flapboard.css'
import './styles/landing.css'
import { Flapboard } from './js/flapboard.js'
import { asset } from './js/paths.js'

/* ============================================================
   LANDING — a departures board
   One row per trip, plus empty rows below. The status column does
   the work: BOARDING for the one that's live, ON TIME for what's
   planned, CLOSED for a trip that's been, ??? for the rest.

   A row is ONE board of 38 slots carrying three fields at fixed
   offsets, so the columns line up down the whole board without
   three separate boards to keep in step. The status colour comes
   from tint(), which marks a slot range.
   ============================================================ */

const COLS = 38
/* Where each field starts, and how wide it may be. Taken from the mockup: the
   status text ends around two thirds across, leaving empty board to the right —
   which is what makes it read as a board with room for more. */
const AT = {
  time:   { at: 1,  w: 4  },
  dest:   { at: 6,  w: 12 },
  status: { at: 19, w: 9  },
}
const STATUS = {
  boarding: { text: 'BOARDING',  cls: 'is-boarding' },
  ontime:   { text: 'ON TIME',   cls: 'is-ontime'   },
  closed:   { text: 'CLOSED',    cls: 'is-closed'   },
  none:     { text: 'UNDEFINED', cls: 'is-none'     },
}

/* Lay three fields into one fixed-width line. Each is clipped to its own
   column, so a long name can't run into the next field. */
function row({ month = '???', dest = '???', status = 'none' }){
  const slots = Array(COLS).fill(' ')
  const put = ({ at, w }, text) =>
    [...String(text).slice(0, w)].forEach((c, i) => { slots[at + i] = c })
  put(AT.time, month)
  put(AT.dest, dest)
  put(AT.status, STATUS[status].text)
  return slots.join('')
}

const list = document.getElementById('board')
const boot = document.getElementById('boot')

;(async () => {
  let reg = { trips: [], boardRows: 9 }
  try {
    reg = await (await fetch(asset('trips/index.json'))).json()
  } catch (e) {
    console.error(e)
  }

  const trips = reg.trips ?? []
  const total = Math.max(reg.boardRows ?? 9, trips.length)

  /* Built silently, then turned once the overlay has faded — otherwise the
     first flips happen behind a black screen and you arrive mid-sequence. */
  const rows = Array.from({ length: total }, (_, i) => {
    const trip = trips[i]
    const el = document.createElement(trip ? 'a' : 'div')
    el.className = 'dep-row' + (trip ? '' : ' is-empty')
    if(trip){
      el.href = `./trip.html?trip=${encodeURIComponent(trip.id)}`
      el.setAttribute('aria-label', `${trip.title}, ${trip.period}`)
    }
    list.appendChild(el)

    const status = trip ? (trip.status ?? 'ontime') : 'none'
    const text = row({
      month: trip?.month ?? '???',
      dest: (trip?.boardLabel ?? trip?.title ?? '???').toUpperCase(),
      status,
    })
    const board = Flapboard.mount(el, ' '.repeat(COLS), {
      length: COLS, tick: 95, stagger: 22, cycles: 5,
    })
    board.tint(AT.status.at, AT.status.at + STATUS[status].text.length, STATUS[status].cls)
    return { board, text, delay: i * 260 }
  })

  if(document.fonts?.ready) await document.fonts.ready
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  boot?.classList.add('hide')

  /* row by row, top to bottom, like a board waking up */
  const start = () => rows.forEach(r => setTimeout(() => r.board.set(r.text), r.delay))
  if(!boot) return start()
  boot.addEventListener('transitionend', start, { once: true })
  setTimeout(start, 900)
})()
