/* ============================================================
   PARALLAX
   Shifts the scattered photos as a card moves through the
   viewport, and drops them in the first time it's seen.

   One rAF-throttled scroll listener for the whole page rather
   than one per card, and only cards near the viewport are
   measured — 9 cards x 6 photos is 54 elements, and touching
   them all on every scroll event would be visible.
   ============================================================ */

const REDUCED = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export const Parallax = {
  cards: [],
  ticking: false,

  init(root = document){
    this.cards = [...root.querySelectorAll('#cards .card')]
    if(!this.cards.length) return

    /* the parallax is the only motion here, so reduced-motion simply skips it */
    if(REDUCED()) return

    this.onScroll = () => {
      if(this.ticking) return
      this.ticking = true
      requestAnimationFrame(() => { this.update(); this.ticking = false })
    }
    window.addEventListener('scroll', this.onScroll, { passive: true })
    window.addEventListener('resize', this.onScroll, { passive: true })
    this.update()
  },

  update(){
    const vh = window.innerHeight
    for(const card of this.cards){
      const r = card.getBoundingClientRect()
      /* skip anything more than a screen away */
      if(r.bottom < -vh || r.top > vh * 2) continue
      /* -1 when the card is below the fold, 0 centred, +1 when above */
      const p = (vh / 2 - (r.top + r.height / 2)) / vh
      card.style.setProperty('--p', p.toFixed(4))
    }
  },

  /* cards are rebuilt when the itinerary changes */
  refresh(root = document){
    window.removeEventListener('scroll', this.onScroll)
    window.removeEventListener('resize', this.onScroll)
    this.init(root)
  },
}
