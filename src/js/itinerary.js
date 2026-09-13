import { TRIP, stopDates } from './data.js'

/* ============================================================
   ITINERARY MODAL
   The whole trip, day by day, with dates — opened from the arrow on
   the timeline card. The card itself shows ONE day at a time, which is
   the right size for scrubbing but no use at all for the question
   "so what actually happens": this is that answer.

   It reads Timeline's own schedule rather than deriving a second one.
   That schedule is already the authored dayPlan where a trip has one
   and the derived fallback where it doesn't, so the modal can never
   disagree with the card you opened it from — the two are the same
   data rendered at two zoom levels.
   ============================================================ */

const DAY = 86400000
const fmtDay = d => d?.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }) ?? ''
const fmtLong = d => d?.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) ?? ''

export const ItineraryModal = {
  init(onClose){
    this.el = document.getElementById('itin-modal')
    this.overlay = document.getElementById('itin-overlay')
    this.body = this.el?.querySelector('.im-body')
    if(!this.el) return
    this.onClose = onClose

    this.overlay?.addEventListener('pointerdown', () => this.close())
    this.el.querySelector('.im-close')?.addEventListener('click', () => this.close())
    if(!this.bound){
      this.bound = true
      document.addEventListener('keydown', e => {
        if(e.key === 'Escape' && this.isOpen) this.close()
      })
    }
  },

  /* `schedule` is Timeline's: one entry per day, { baseIdx, spurId, place }.
     `ranges` is its base stops in order, each with the day it starts on. */
  open(itinerary, schedule, ranges){
    if(!this.el || !itinerary || !schedule?.length) return
    const start = itinerary.dateRange?.start
      ? new Date(itinerary.dateRange.start + 'T00:00:00') : null
    const dates = stopDates(itinerary)
    const bases = itinerary.stops.filter(s => !s.spur)
    const dateOf = day => start ? new Date(start.getTime() + day * DAY) : null

    /* Days are grouped under the stay they belong to, because that is how the
       trip is actually lived — and it puts the travel days where you can see
       them, at the head of each group rather than buried in a flat list. */
    const groups = ranges.map((r, i) => ({
      idx: i,
      stop: bases[i],
      loc: TRIP.byId[r.locationId],
      days: [],
    }))
    schedule.forEach((entry, day) => groups[entry.baseIdx]?.days.push({ day, entry }))

    const rows = groups.filter(g => g.days.length).map(g => {
      const nights = g.stop?.nights ?? 0
      const dr = dates[g.loc?.id]
      const arrival = g.idx === 0
        ? 'Arrive'
        : g.stop?.arriveBy === 'flight' ? 'Fly in' : 'Overland'

      const days = g.days.map(({ day, entry }) => {
        const spur = entry.spurId ? TRIP.byId[entry.spurId] : null
        const where = spur?.name?.en ?? entry.place ?? g.loc?.name?.en ?? ''
        return `<li class="im-day${spur ? ' is-trip' : ''}">
          <span class="im-daynum">Day ${day + 1}</span>
          <span class="im-date">${fmtDay(dateOf(day))}</span>
          <span class="im-where">${where}</span>
          ${spur ? '<span class="im-tag">day trip</span>' : ''}
        </li>`
      }).join('')

      return `<section class="im-group">
        <header class="im-grouphead">
          <h3 class="im-place">${g.loc?.name?.en ?? g.stop?.locationId ?? ''}</h3>
          <p class="im-meta">
            <span class="im-arrive">${arrival}</span>
            ${nights ? `<span class="im-nights">${nights} night${nights > 1 ? 's' : ''}</span>` : ''}
            ${dr ? `<span class="im-span">${fmtDay(dr.from)} – ${fmtDay(dr.to)}</span>` : ''}
          </p>
        </header>
        <ol class="im-days">${days}</ol>
      </section>`
    }).join('')

    this.body.innerHTML = `
      <header class="im-head">
        <p class="im-eyebrow">${itinerary.label ?? 'Itinerary'}</p>
        <h2 class="im-title">${itinerary.days} days${
          itinerary.flights != null ? ` · ${itinerary.flights} flight${itinerary.flights === 1 ? '' : 's'}` : ''}</h2>
        ${start ? `<p class="im-range">${fmtLong(start)} – ${fmtLong(dateOf(this.lastDay(schedule)))}</p>` : ''}
      </header>
      ${rows}`

    this.isOpen = true
    this.el.hidden = false
    if(this.overlay) this.overlay.hidden = false
    document.body.classList.add('has-itin')
    requestAnimationFrame(() => {
      this.el.classList.add('is-open')
      this.overlay?.classList.add('is-open')
    })
    /* focus moves into the panel so Escape and tabbing land somewhere sane */
    this.el.querySelector('.im-close')?.focus()
  },

  lastDay(schedule){ return schedule.length - 1 },

  close(){
    if(!this.isOpen) return
    this.isOpen = false
    document.body.classList.remove('has-itin')
    this.el.classList.remove('is-open')
    this.overlay?.classList.remove('is-open')
    const hide = () => { if(!this.isOpen){ this.el.hidden = true; if(this.overlay) this.overlay.hidden = true } }
    this.el.addEventListener('transitionend', hide, { once:true })
    setTimeout(hide, 400)
    this.onClose?.()
  },
}
