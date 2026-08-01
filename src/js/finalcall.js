import { TRIP } from './data.js'
import { flightSearchUrl } from './footer.js'
import { scrollToEl } from './scroll.js'

/* ============================================================
   FINAL CALL
   A sticky panel that appears once the hero has scrolled away
   and hides again when the footer arrives — the footer has its
   own, larger version of the same call to action, so two on
   screen at once would just compete.
   ============================================================ */

export const FinalCall = {
  el: null,
  btn: null,
  atFooter: false,

  init(){
    this.el  = document.getElementById('final-call')
    this.btn = this.el?.querySelector('.fc-btn')
    if(!this.el) return

    /* Visible from the first frame — the only thing that hides it is the
       footer, which carries its own, larger version of the same CTA. An
       observer rather than a scroll handler: no throttling to get wrong. */
    const footer = document.getElementById('footer')
    if(footer) new IntersectionObserver(([e]) => {
      this.atFooter = e.isIntersecting
      this.apply()
    }, { threshold: 0 }).observe(footer)

    this.apply()
  },

  /* Called on every itinerary change: the search follows the active variant,
     and an undated one has nothing to link to. */
  update(itinerary){
    if(!this.btn) return
    const url = flightSearchUrl(itinerary)
    const label = TRIP.data?.cta?.buttonLabel

    if(url){
      this.btn.href = url
      this.btn.removeAttribute('aria-disabled')
      this.btn.textContent = 'ARE YOU IN?'
      this.btn.title = ''
    } else {
      /* no dates — fall back to the footer, where the budget and the dated
         options live, rather than dead-ending on a broken link */
      this.btn.removeAttribute('href')
      this.btn.setAttribute('aria-disabled', 'true')
      this.btn.textContent = 'SEE THE COSTS'
      this.btn.title = 'This itinerary has no exact dates yet'
    }
    void label
  },

  apply(){
    if(!this.el) return
    const show = !this.atFooter
    this.el.hidden = false          /* only ever hidden before the first render */
    this.el.classList.toggle('is-visible', show)
    this.el.setAttribute('aria-hidden', show ? 'false' : 'true')
    /* keep it out of the tab order while it's off screen */
    this.btn?.setAttribute('tabindex', show ? '0' : '-1')
  },
}

/* clicking with no link scrolls to the footer instead */
document.addEventListener('click', e => {
  const btn = e.target.closest('#final-call .fc-btn')
  if(!btn || btn.getAttribute('aria-disabled') !== 'true') return
  e.preventDefault()
  scrollToEl(document.getElementById('footer'))
})
