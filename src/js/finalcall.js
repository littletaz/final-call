import { TRIP } from './data.js'
import { flightSearchUrl } from './footer.js'
import { scrollToEl } from './scroll.js'
import { Flapboard } from './flapboard.js'

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
  board: null,
  atFooter: false,
  pastHero: false,
  msgIndex: 0,

  /* both are 10 slots, so the board never resizes between them */
  MESSAGES: ['FINAL CALL', 'ARE U IN?'],
  CYCLE: 3000,

  /* Sizing works FORWARD from a whole-pixel tile, and is FIXED — the panel is
     231px on a 1280 screen and on a 2560 one. It's a physical object, not a
     layout element, so scaling it with the viewport just made it inconsistent.

       tile        22 x 32   (22 x 90/62 = 31.94, rounded)
       board       10 tiles + 9 gutters of -1  = 211px
       stack       4px between board and buttons
       buttons     30px tall
       panel       211 + 2 x 10 padding        = 231px
       buttons     (211 - 1) / 2               = 105px each

     Only the mobile breakpoint changes anything, and it swaps one constant. */
  SLOTS: 10,
  RATIO: 90 / 62,          /* from the tile artwork */
  GUTTER: -1,              /* housings butt into each other */
  STACK: 4,                /* board to buttons */
  BTN_H: 30,               /* button height */
  TILE: { wide: 22, narrow: 19 },
  PAD:  { wide: 10, narrow: 9 },

  init(){
    this.el  = document.getElementById('final-call')
    this.btn = this.el?.querySelector('.fc-yes')
    this.no  = this.el?.querySelector('.fc-no')
    if(!this.el) return

    /* tick and stagger are independent: tick is one fold, stagger is the wave */
    this.sizeBoard()
    this.board = Flapboard.mount(this.el.querySelector('.fc-logo'),
                                 this.MESSAGES[0],
                                 { length: this.SLOTS, tick: 90, stagger: 55 })

    /* nothing to recompute on resize — only crossing the breakpoint changes it */
    const mq = window.matchMedia('(max-width: 860px)')
    const onBreak = () => this.sizeBoard()
    mq.addEventListener ? mq.addEventListener('change', onBreak) : mq.addListener(onBreak)


    /* Visible from the first frame — the only thing that hides it is the
       footer, which carries its own, larger version of the same CTA. An
       observer rather than a scroll handler: no throttling to get wrong. */
    const footer = document.getElementById('footer')
    if(footer) new IntersectionObserver(([e]) => {
      this.atFooter = e.isIntersecting
      this.apply()
    }, { threshold: 0 }).observe(footer)

    /* full size over the hero, compact once you're into the cards */
    const stage = document.getElementById('stage')
    if(stage) new IntersectionObserver(([e]) => {
      this.pastHero = !e.isIntersecting
      this.apply()
    }, { threshold: 0 }).observe(stage)

    /* NO goes to its own page. It was a section of the footer for a while,
       but as a fixed layer behind the trip it fought the card parallax and
       the reveal never settled. */
    this.no?.addEventListener('click', () => {
      clearInterval(this.timer)
      location.href = './no.html'
    })

    this.apply()
    this.startCycle()
  },

  /* Whole-pixel tiles at every viewport — CSS can't round, so this is done
     here and written back as custom properties. */
  sizeBoard(){
    const narrow = window.matchMedia('(max-width: 860px)').matches
    const w = narrow ? this.TILE.narrow : this.TILE.wide
    const h = Math.round(w * this.RATIO)
    const pad = narrow ? this.PAD.narrow : this.PAD.wide

    const st = this.el.style
    st.setProperty('--flap-w', w + 'px')
    st.setProperty('--flap-h', h + 'px')
    st.setProperty('--fc-gap', this.GUTTER + 'px')
    st.setProperty('--fc-gut', Math.abs(this.GUTTER) + 'px')
    st.setProperty('--fc-stack', this.STACK + 'px')
    st.setProperty('--fc-btn-h', this.BTN_H + 'px')
    st.setProperty('--fc-pad', pad + 'px')
  },

  /* Alternates the two messages. Paused whenever the widget isn't on screen —
     flipping a board nobody can see is just work. */
  startCycle(){
    clearInterval(this.timer)
    this.timer = setInterval(() => {
      if(!this.visible) return
      this.msgIndex = (this.msgIndex + 1) % this.MESSAGES.length
      this.board?.set(this.MESSAGES[this.msgIndex])
    }, this.CYCLE)
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
      this.btn.textContent = 'YES'
      this.btn.title = ''
    } else {
      /* no dates — fall back to the footer, where the budget and the dated
         options live, rather than dead-ending on a broken link */
      this.btn.removeAttribute('href')
      this.btn.setAttribute('aria-disabled', 'true')
      this.btn.textContent = 'COSTS'
      this.btn.title = 'This itinerary has no exact dates yet'
    }
    void label
  },

  apply(){
    if(!this.el) return
    const wasVisible = this.visible
    const show = !this.atFooter
    this.visible = show
    this.el.hidden = false          /* only ever hidden before the first render */
    this.el.classList.toggle('is-visible', show)
    /* re-flap on return, so it reads as a board waking up */
    if(show && !wasVisible) this.board?.set(this.MESSAGES[this.msgIndex])
    this.el.classList.toggle('is-compact', this.pastHero)

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
