import { TRIP, tripAsset, stayTotal, stopDates, bookingUrl, eur } from './data.js'
import { watchImages } from './placeholder.js'

/* ============================================================
   POI CARD
   One place, opened from its pin. Fixed to the bottom-right of
   the grid so it never chases the pin around the map, and so its
   position is the same every time — a card that moves is a card
   you have to find.

   Photos sit behind it at an angle, a couple showing past the
   edge, rather than being the content.
   ============================================================ */

const PHOTOS = 2          /* how many show below the card */
/* Pinned to the bottom of the card and cropped by it — the wrapper's overflow
   does the cropping, so the prints can hang past every edge and simply
   disappear. Placed by hand, front to back. */
const TILT = [
  { r: 13,  x: -14, y: -21, z: 3 },
  { r: -15, x: 34,  y: 10,  z: 2 },
]

const narrow = () => window.matchMedia('(max-width: 860px)').matches

const fmt = d => d?.toLocaleDateString('en-GB', { day:'numeric', month:'short' }) ?? ''

export const PoiCard = {
  el: null, photos: null, body: null,
  openId: null,

  init(itinerary, onClose){
    this.el     = document.getElementById('poi-card')
    this.photos = this.el?.querySelector('.pc-photos')
    this.body   = this.el?.querySelector('.pc-content')
    if(!this.el) return
    this.itinerary = itinerary
    this.onClose = onClose

    this.overlay = document.getElementById('poi-overlay')
    this.overlay?.addEventListener('pointerdown', () => this.close())
    /* the close button needs its own handler: a pointerdown inside the card
       closes anyway, but a keyboard Enter on the button would not */
    this.el.querySelector('.pc-close')?.addEventListener('click', () => this.close())

    if(!this.bound){
      this.bound = true
      /* On a wide screen the card is a glance, so anything outside the hotel
         links closes it. On a phone it's a sheet under your thumb — a tap
         anywhere in it would close it by accident, so there it takes the
         overlay or the close button. */
      document.addEventListener('pointerdown', e => {
        if(!this.openId) return
        if(e.target.closest('.hotel')) return
        if(e.target.closest('.poi')) return      /* the pin toggles, below */
        if(narrow() && e.target.closest('#poi-card')) return
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
      const t = TILT[i] ?? { r: 0, x: 0, y: 0, z: 1 }
      return `<figure class="pc-photo" style="
              --tilt:${t.r}deg;left:${t.x}%;bottom:${t.y}%;z-index:${t.z}">
        ${ph.src ? `<img src="${tripAsset(ph.src)}" alt="" loading="lazy">` : ''}
      </figure>`
    }).join('')
    watchImages(this.photos, img => img.getAttribute('src')?.split('/').pop())

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
      const url = bookingUrl(st, stop, stopDates(this.itinerary),
                            TRIP.data?.cta?.roomAdults ?? 2)
      return url
        ? `<a class="hotel is-link" href="${url}" target="_blank"
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
      ${(loc.kanjiChips ?? []).length
        ? `<p class="pc-chips">${loc.kanjiChips.map(k => `<span class="chip">${k}</span>`).join('')}</p>`
        : ''}`

    this.el.hidden = false
    if(this.overlay) this.overlay.hidden = false
    /* Locked while the sheet is up: on a phone it covers the page, so a stray
       scroll would move something you can't see behind it. */
    document.body.classList.add('has-poi')
    requestAnimationFrame(() => {
      this.el.classList.add('is-open')
      this.overlay?.classList.add('is-open')
    })
    document.querySelectorAll('.poi').forEach(p =>
      p.classList.toggle('is-current', p.dataset.locationId === locationId))
  },

  close(){
    this.openId = null
    document.body.classList.remove('has-poi')
    this.el.classList.remove('is-open')
    this.overlay?.classList.remove('is-open')
    document.querySelectorAll('.poi').forEach(p => p.classList.remove('is-current'))
    this.onClose?.()
  },
}
