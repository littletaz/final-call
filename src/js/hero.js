import { tripAsset } from './data.js'

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
