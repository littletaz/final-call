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

   A row is ONE board of 35 slots carrying three fields at fixed
   offsets, so the columns line up down the whole board without
   three separate boards to keep in step. The status colour comes
   from tint(), which marks a slot range; the gaps between fields
   are `frozen` slots that stay blank and never turn.
   ============================================================ */

const COLS = 35

/* Where each field starts and how wide it may be, plus the slots that stay
   blank. The separators aren't decoration — they're what stops the columns
   running into each other on a board with no gridlines. */
const AT = {
  time:   { at: 1,  w: 3  },
  dest:   { at: 6,  w: 12 },
  status: { at: 20, w: 14 },
}
const FROZEN = [0, 4, 5, 18, 19, 34]

const STATUS = {
  boarding: { text: 'BOARDING',     cls: 'is-boarding' },
  ontime:   { text: 'ON TIME',      cls: 'is-ontime'   },
  closing:  { text: 'GATE CLOSING', cls: 'is-closing'  },
  closed:   { text: 'CLOSE',        cls: 'is-closed'   },
  none:     { text: 'UNDEFINED',    cls: 'is-none'     },
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

/* the icon is a file, so it can be swapped without touching the markup */
const icon = document.querySelector('.dep-icon')
if(icon) fetch(asset('shared/ui/departures.svg')).then(r => r.text()).then(svg => { icon.innerHTML = svg })

const list = document.getElementById('board')
const boot = document.getElementById('boot')

/* How many rows to fill the rest of the viewport. Measured rather than guessed:
   the header scales with the flaps, so the space below it isn't a constant.

   Rounded UP and then one more. A board that stops short leaves a black gap
   below the last row, which reads as broken; one that runs a few pixels past
   the fold reads as a board that continues. Overshooting is the safe error. */
function rowsThatFit(){
  const h = parseFloat(getComputedStyle(document.body).getPropertyValue('--dep-h')) || 70
  const top = list.getBoundingClientRect().top
  const inner = window.innerHeight - top - 18   /* 1px border + 8px padding, twice */
  return Math.max(2, Math.ceil(inner / (h + 8)) + 1)
}

;(async () => {
  let reg = { trips: [] }
  try {
    reg = await (await fetch(asset('trips/index.json'))).json()
  } catch (e) {
    console.error(e)
  }

  /* Trips that have been and gone sit above the live ones — they turn like any
     other row but have nothing to link to. */
  const extras = (reg.boardExtras ?? []).map(x => ({ ...x, past: true }))
  const trips = [...extras, ...(reg.trips ?? [])]

  /* The count is measured AFTER the font and the icon have landed. Both change
     the header's height, and measuring first gave a board sized for a layout
     that no longer existed. */
  if(document.fonts?.ready) await document.fonts.ready
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

  const total = Math.max(rowsThatFit(), trips.length)

  const rows = Array.from({ length: total }, (_, i) => {
    const trip = trips[i]
    const linkable = trip && !trip.past
    const el = document.createElement(linkable ? 'a' : 'div')
    el.className = 'dep-row' + (trip ? (trip.past ? ' is-past' : '') : ' is-empty')
    if(linkable){
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
      length: COLS, tick: 95, stagger: 22, cycles: 5, frozen: FROZEN,
    })
    board.tint(AT.status.at, AT.status.at + STATUS[status].text.length, STATUS[status].cls)

    /* An undefined row doesn't turn. There's nothing to reveal, and a screen of
       flaps churning their way to UNDEFINED pulls attention off the trips that
       actually say something. */
    return { board, text, animate: !!trip, delay: i * 260 }
  })

  /* the empty rows are simply there, from the first frame */
  rows.filter(r => !r.animate).forEach(r => r.board.set(r.text, { immediate: 'silent' }))
  boot?.classList.add('hide')

  const start = () => rows
    .filter(r => r.animate)
    .forEach(r => setTimeout(() => r.board.set(r.text), r.delay))
  if(!boot) return start()
  boot.addEventListener('transitionend', start, { once: true })
  setTimeout(start, 900)

  /* A taller window needs more rows. Added rather than rebuilt, so the trips
     don't re-animate every time the window is dragged. */
  let t
  addEventListener('resize', () => {
    clearTimeout(t)
    t = setTimeout(() => {
      const want = rowsThatFit()
      for(let i = list.children.length; i < want; i++){
        const el = document.createElement('div')
        el.className = 'dep-row is-empty'
        list.appendChild(el)
        const b = Flapboard.mount(el, ' '.repeat(COLS), {
          length: COLS, tick: 95, stagger: 22, cycles: 5, frozen: FROZEN,
        })
        b.tint(AT.status.at, AT.status.at + STATUS.none.text.length, STATUS.none.cls)
        b.set(row({}), { immediate: 'silent' })
      }
    }, 300)
  })
})()
