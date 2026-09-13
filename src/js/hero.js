import { tripAsset } from './data.js'

/* Same read as src/js/scroll.js — checked once, at module scope. */
const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ============================================================
   HERO
   Static title screen above the map — title (split on " & "),
   an optional date pill, and a scatter of sticker decorations.
   Renders once at boot; doesn't react to itinerary switching.
   ============================================================ */
export const Hero = {
  render(t){
    const root = document.getElementById('hero')
    if(!root) return

    const titleEl = root.querySelector('.hero-title')
    if(titleEl){
      if(t.hero?.logo){
        /* trip supplies its own hand-drawn wordmark (Figma-exported SVG) —
           use it in place of the split-text title; title text still carries
           the accessible name. */
        titleEl.innerHTML = `<img class="hero-logo" src="${tripAsset(t.hero.logo)}" alt="${t.title || ''}">`
      }else{
        const parts = (t.title || '').split(' & ')
        titleEl.innerHTML = parts.length === 2
          ? `<span class="hero-word hero-word--a">${parts[0]}</span>`
            + `<span class="hero-amp" aria-hidden="true">&amp;</span>`
            + `<span class="hero-word hero-word--b">${parts[1]}</span>`
          : `<span class="hero-word hero-word--a">${t.title || ''}</span>`
      }
    }

    const pill = root.querySelector('.hero-pill')
    if(pill){
      const itin = t.itineraries?.find(i => i.id === t.defaultItineraryId) || t.itineraries?.[0]
      const label = t.hero?.datePill ? itin?.periodDisplay : null
      pill.textContent = label || ''
      pill.hidden = !label
    }

    this.renderStickers(t.hero?.stickers || [])
  },

  /* ---- the sticker scatter -------------------------------------------------
     Each sticker is placed by its CENTRE, in the centred design canvas's own
     coordinates — so the whole scatter stays put relative to the layout
     instead of drifting with the window, which is what percentages of a
     vh-tall box did before. Two sets of coordinates, one per canvas
     (see trip.json's hero._stickerNote); CSS picks between them, so a
     resize inside a breakpoint costs nothing.

     `anchor` is the one thing JS has to measure: the lower stickers hang off
     a section rather than the top of the page, because this page is as tall
     as its budget ledger and that is data, not design. */
  renderStickers(list){
    const root = document.getElementById('page-stickers')
    if(!root) return

    this.stickers = list.map(s => {
      const img = document.createElement('img')
      img.src = tripAsset(s.src)
      img.alt = ''
      img.className = 'hero-sticker'
      if(s.rotate) img.style.setProperty('--rot', s.rotate + 'deg')
      /* suffixed, never the bare --sx: an inline custom property would beat
         the media query that swaps the two sets */
      for(const [set, key] of [['wide', '-wide'], ['narrow', '-narrow']]){
        const v = s[set]
        if(!v) continue
        img.style.setProperty(`--sx${key}`, v.x + 'px')
        img.style.setProperty(`--sy${key}`, v.y + 'px')
        img.style.setProperty(`--sw${key}`, v.w + 'px')
      }
      /* no `narrow` block means Figma doesn't draw it on the mobile canvas */
      img.classList.toggle('is-wide-only', !s.narrow)
      return { el: img, anchor: s.anchor || null }
    })

    root.replaceChildren(...this.stickers.map(s => s.el))
    this.placeStickers()
  },

  /* Anchored stickers are offset from their section's top, so they have to be
     re-measured whenever the page reflows: sections arrive after this runs
     (the footer is rendered per-itinerary), images settle late, and the
     budget ledger's height is data.

     getBoundingClientRect rather than offsetTop — offsetTop is measured from
     the nearest POSITIONED ancestor, so a section inside one reports a
     number that has nothing to do with the page, which is the space
     #page-stickers lives in. */
  placeStickers(){
    for(const { el, anchor } of this.stickers ?? []){
      if(!anchor){ el.style.removeProperty('--sanchor'); continue }
      const target = document.querySelector(anchor)
      el.style.setProperty('--sanchor',
        (target ? target.getBoundingClientRect().top + window.scrollY : 0) + 'px')
    }
    this.measureParallax()
  },

  /* ---- scroll parallax -----------------------------------------------------
     The scatter sits on the page rather than on any one section, so drifting
     it slightly against the scroll is what stops it reading as printed onto
     the background. Deliberately small: this is paper lifting off paper, not
     a depth effect.

     Each sticker gets its own rate, from its own width — a bigger sticker
     reads as nearer, and nearer things move more. The numbers below put the
     widest sticker in this trip (the sheep, 207px) at 0.10 and the narrowest
     (the kangaroo, 107.5px) at 0.04.

     `base` is the scroll position at which the sticker sits EXACTLY where
     Figma draws it, and the trip data already says which that is. An
     ANCHORED sticker hangs off a section, so its design position is the one
     you see when that section is in front of you — its centre on the
     viewport's centre line. The hero's four have no anchor: they are drawn
     against the top of the page, so theirs is the one at rest, at scroll 0.
     Splitting on `anchor` rather than on measured position is what keeps the
     hero pixel-exact on load — by distance alone the Sydney badge, 563px
     down a 900px viewport, would start 10px adrift of the mockup.

     The anchored case is clamped into the document so a sticker near the
     bottom, which can never reach the middle of the viewport, settles at its
     drawn position when you reach the end of the page rather than hanging
     permanently below it.

     offsetTop, not getBoundingClientRect: the rect already has the parallax
     transform baked in, so measuring it here would feed the offset back into
     itself. offsetTop is the resolved `top` — the sticker's design centre in
     page coordinates, since #page-stickers is its offsetParent at page 0 and
     the -50% translate centres it on that line. */
  /* Travel across a full viewport of scrolling is +-(innerHeight / 2) * rate,
     so roughly 13px for the narrowest sticker and 31px for the widest on a
     900px screen. Enough to come unstuck from the paper, not enough to read
     as a separate moving layer. */
  PARALLAX_SLOW: 0.03,
  PARALLAX_FAST: 0.07,

  measureParallax(){
    const list = this.stickers ?? []
    if(!list.length) return
    const widths = list.map(s => s.el.offsetWidth || 0)
    const min = Math.min(...widths), max = Math.max(...widths)
    const span = max - min
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight)

    list.forEach((s, i) => {
      const t = span ? (widths[i] - min) / span : 0
      s.depth = this.PARALLAX_SLOW + (this.PARALLAX_FAST - this.PARALLAX_SLOW) * t
      s.base  = s.anchor
        ? Math.min(Math.max(s.el.offsetTop - innerHeight / 2, 0), maxScroll)
        : 0
    })
    this.parallax()
  },

  parallax(){
    if(REDUCED) return
    for(const s of this.stickers ?? []){
      if(s.depth == null) continue
      s.el.style.setProperty('--py', ((scrollY - s.base) * s.depth).toFixed(1) + 'px')
    }
  },

  /* One listener for the whole scatter, coalesced onto a frame — scroll fires
     far more often than the screen repaints, and this writes to seven
     elements. Reduced motion opts out entirely rather than shortening the
     travel: --py is then never written, so the stickers keep the exact
     coordinates the trip file gives them. */
  watchParallax(){
    if(REDUCED || this.parallaxWatching) return
    this.parallaxWatching = true

    let raf = 0
    addEventListener('scroll', () => {
      if(raf) return
      raf = requestAnimationFrame(() => { raf = 0; this.parallax() })
    }, { passive: true })
    /* No resize listener of its own: `base` depends on the viewport height,
       but main.js already re-runs placeStickers() on resize (scheduleTexture)
       and that re-measures. */
  },

  /* The page's height changes on its own — late images, webfonts, an
     itinerary switch that rewrites the ledger — and every one of those moves
     the sections the lower stickers hang off. */
  watchStickers(){
    if(!window.ResizeObserver || this.stickerObserver) return
    this.stickerObserver = new ResizeObserver(() => this.placeStickers())
    this.stickerObserver.observe(document.body)
  },
}
