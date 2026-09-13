import { tripAsset } from './data.js'

/* ============================================================
   BOOT
   The loading screen. The page is a single long scroll made almost
   entirely of artwork — map.png is several megabytes on its own — so
   without a hold the whole thing assembles itself in front of you:
   text first, then the map, then the stickers landing one by one. The
   hold turns that into something deliberate.

   What it shows is the trip's OWN stickers, stacking. They are small,
   already being fetched for the page itself, and they are the one
   asset that reads at any size — so the wait is made of the thing you
   are waiting for rather than a spinner.
   ============================================================ */

const REDUCED = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* How many stack. More than about five and the last ones arrive after
   anyone has stopped looking; fewer and the loop reads as a blink. */
const MAX = 5

/* One sticker's own appearance, and the gap before the next starts. The
   gap is shorter than the appearance, so a sticker is still settling as
   the next one lands — which is what makes it read as a hand placing
   them rather than a list playing out. */
const APPEAR_MS = 620
const STAGGER_MS = 260
/* Held at full stack before the loop restarts, so the finished pile is
   legible as a composition rather than flashing away on the last frame. */
const HOLD_MS = 900

export const Boot = {
  el: null,

  init(){
    this.el = document.getElementById('boot')
    this.stack = this.el?.querySelector('.boot-stack')
  },

  /* Called once the trip data resolves — before its images are in, which is
     the whole point: these are the first things fetched and the rest of the
     page loads behind them. */
  start(trip){
    if(!this.stack) return
    const list = (trip.hero?.stickers ?? []).slice(0, MAX)
    if(!list.length) return

    const total = list.length * STAGGER_MS + APPEAR_MS + HOLD_MS
    this.stack.style.setProperty('--boot-cycle', total + 'ms')

    this.stack.replaceChildren(...list.map((s, i) => {
      const img = document.createElement('img')
      img.className = 'boot-sticker'
      img.src = tripAsset(s.src)
      img.alt = ''
      /* Each sticker runs the SAME animation over the same cycle length and
         is offset into it by its own delay — so they share one timeline and
         can never drift apart, however long the load takes. A negative delay
         would start them mid-flight, so the delays are positive and the
         keyframes carry the "not yet here" state at 0%. */
      img.style.animationDelay = (i * STAGGER_MS) + 'ms'
      /* Stacked, each slightly proud of the last, rotated a little so the
         pile reads as paper rather than as a sprite sheet. Deterministic
         from the index — a random scatter looks different on every reload,
         which is the opposite of what a loader wants. */
      const spread = (i - (list.length - 1) / 2)
      img.style.setProperty('--i', i)
      img.style.setProperty('--dx', (spread * 30).toFixed(1) + 'px')
      img.style.setProperty('--dy', (spread * -21).toFixed(1) + 'px')
      img.style.setProperty('--rot', (spread * 5.5).toFixed(1) + 'deg')
      return img
    }))

    if(!REDUCED()) this.stack.classList.add('is-running')
  },

  /* Waits for the artwork the first screen is actually made of, so the
     reveal lands on a finished page. Capped: a slow connection should get
     the page late, not never — and a failed image resolves like a loaded
     one, since a placeholder is still something to look at. */
  whenReady(timeout = 8000){
    const imgs = [...document.querySelectorAll('#basemap, .hero-logo, #page-stickers img')]
    const settled = imgs.map(img => img.complete
      ? Promise.resolve()
      : new Promise(r => { img.addEventListener('load', r, { once:true })
                           img.addEventListener('error', r, { once:true }) }))
    const fonts = document.fonts?.ready ?? Promise.resolve()
    return Promise.race([
      Promise.all([...settled, fonts]),
      new Promise(r => setTimeout(r, timeout)),
    ])
  },

  /* Fades rather than cuts: the stack is mid-animation and a hard swap
     reads as a flicker. The element keeps its space until the transition
     ends, then leaves the layout entirely. */
  finish(){
    if(!this.el) return
    this.el.classList.add('is-done')
    const done = () => this.el.classList.add('hide')
    this.el.addEventListener('transitionend', done, { once:true })
    setTimeout(done, 700)          /* if the transition never fires */
  },
}
