import { TRIP, tripAsset, stayTotal, stopDates, eur } from './data.js'

/* ============================================================
   POI CARD
   One place, opened from its pin. Fixed to the bottom-right of
   the grid so it never chases the pin around the map, and so its
   position is the same every time — a card that moves is a card
   you have to find.

   Photos sit behind it at an angle, a couple showing past the
   edge, rather than being the content.
   ============================================================ */

const PHOTOS = 2          /* how many show above the card */
/* back to front: angle, and how far along the top edge they sit */
const TILT = [{ r: 4, x: 14 }, { r: -5, x: -2 }]

const fmt = d => d?.toLocaleDateString('en-GB', { day:'numeric', month:'short' }) ?? ''

export const PoiCard = {
  el: null, photos: null, body: null,
  openId: null,

  init(itinerary, onClose){
    this.el     = document.getElementById('poi-card')
    this.photos = this.el?.querySelector('.pc-photos')
    this.body   = this.el?.querySelector('.pc-body')
    if(!this.el) return
    this.itinerary = itinerary
    this.onClose = onClose

    this.overlay = document.getElementById('poi-overlay')

    if(!this.bound){
      this.bound = true
      /* Anything that isn't a hotel link closes it — including the card itself.
         The card is a glance, not a place to linger, so the only thing worth
         protecting from a stray click is the three links that leave the page. */
      document.addEventListener('pointerdown', e => {
        if(!this.openId) return
        if(e.target.closest('.hotel')) return
        if(e.target.closest('.poi')) return      /* the pin toggles, below */
        this.close()
      })
      document.addEventListener('keydown', e => {
        if(e.key === 'Escape' && this.openId) this.close()
      })
    }
    this.close()
  },

  toggle(locationId){
    if(this.openId === locationId) return this.close()
    this.open(locationId)
  },

  open(locationId){
    const loc = TRIP.byId[locationId]
    const stop = this.itinerary.stops.find(s => s.locationId === locationId)
    if(!loc || !stop) return

    this.openId = locationId
    const dates = stopDates(this.itinerary)[locationId]
    const nights = stop.spur
      ? 'day trip'
      : `${stop.nights} night${stop.nights === 1 ? '' : 's'}`

    this.photos.innerHTML = (loc.photos ?? []).slice(0, PHOTOS).map((ph, i) => {
      const t = TILT[i] ?? { r: 0, x: 0 }
      return `<figure class="pc-photo" style="--tilt:${t.r}deg;left:${t.x}%;z-index:${PHOTOS - i}">
        ${ph.src ? `<img src="${tripAsset(ph.src)}" alt="" loading="lazy">` : ''}
      </figure>`
    }).join('')

    const stays = loc.stays.slice(0, 3).map(st => {
      const t = stayTotal(st, stop)
      const amount = t
        ? `${eur(t.lo)}\u2013${eur(t.hi)}`
        : `${eur(st.priceNightEUR[0])}\u2013${eur(st.priceNightEUR[1])}<span class="per-night">/night</span>`
      const inner = `
        <span class="tier">${st.tier[0].toUpperCase() + st.tier.slice(1)}</span>
        <span class="hotel-row">
          <span class="name">${st.name}</span>
          <span class="amount">${amount}</span>
        </span>`
      return st.bookingUrl
        ? `<a class="hotel is-link" href="${st.bookingUrl}" target="_blank"
              rel="noopener noreferrer" title="${st.name}">${inner}</a>`
        : `<div class="hotel">${inner}</div>`
    }).join('')

    this.body.innerHTML = `
      <h2 class="pc-title">${loc.name.en}</h2>
      <div class="pc-stays">${stays}</div>
      <p class="pc-when">
        ${dates ? `<span class="pc-dates">${fmt(dates.from)} to ${fmt(dates.to)}</span>` : ''}
        <span class="pc-nights">${nights}</span>
      </p>
      <p class="pc-chips">${loc.kanjiChips.map(k => `<span class="chip">${k}</span>`).join('')}</p>`

    this.el.hidden = false
    if(this.overlay) this.overlay.hidden = false
    requestAnimationFrame(() => {
      this.el.classList.add('is-open')
      this.overlay?.classList.add('is-open')
    })
    document.querySelectorAll('.poi').forEach(p =>
      p.classList.toggle('is-current', p.dataset.locationId === locationId))
  },

  close(){
    this.openId = null
    this.el.classList.remove('is-open')
    this.overlay?.classList.remove('is-open')
    document.querySelectorAll('.poi').forEach(p => p.classList.remove('is-current'))
    this.onClose?.()
  },
}
