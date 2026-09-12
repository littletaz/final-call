import { tripAsset } from './data.js'

/* ============================================================
   HIGHLIGHTS ("L'essentiel")
   A horizontally draggable strip of trip-level photo "tickets" — each
   image already carries its own place/date/title (baked into the
   artwork), so this just lays them out, tilted, and makes the strip
   scrollable by drag, arrow buttons, or native touch scroll.

   Replaces the old mood/arguments/gem pitch slides for any trip that
   supplies `highlights` — see main.js's renderAll(), which skips
   Pitch.render() in that case. A trip without `highlights` (japon-2026,
   for now) keeps the old pitch behaviour untouched.
   ============================================================ */

const TILT = [-4, 6, -3, 8, -6] /* deg, cycles if there are more than 5 */

export const Highlights = {
  render(t){
    const root = document.getElementById('highlights')
    const track = root?.querySelector('.hl-track')
    if(!root || !track || !t.highlights?.length) return

    track.replaceChildren(...t.highlights.map((h, i) => {
      const fig = document.createElement('figure')
      fig.className = 'hl-card'
      fig.style.setProperty('--tilt', `${TILT[i % TILT.length]}deg`)
      const img = document.createElement('img')
      img.src = tripAsset(h.src)
      img.alt = h.alt || ''
      img.loading = 'lazy'
      fig.appendChild(img)
      return fig
    }))

    /* Trip-owned art, set as custom properties so highlights.css stays
       trip-agnostic — same pattern as --tl-link-icon in timeline.js.
       Absolute, because a relative url() in a custom property resolves
       against the stylesheet, which lives in /assets/ once built. */
    const abs = file => new URL(tripAsset(file), document.baseURI).href
    const style = document.documentElement.style
    style.setProperty('--hl-arrow-prev', `url('${abs('img/highlights/arrow-prev.svg')}')`)
    style.setProperty('--hl-arrow-next', `url('${abs('img/highlights/arrow-next.svg')}')`)

    root.hidden = false
    this.bind(root, track)
  },

  bind(root, track){
    if(track.dataset.bound) return
    track.dataset.bound = '1'

    const step = () => (track.querySelector('.hl-card')?.offsetWidth || 300) + 24

    root.querySelector('.hl-prev')?.addEventListener('click', () =>
      track.scrollBy({ left: -step(), behavior:'smooth' }))
    root.querySelector('.hl-next')?.addEventListener('click', () =>
      track.scrollBy({ left: step(), behavior:'smooth' }))

    /* Minimal drag-to-scroll: translate a pointer drag into scrollLeft.
       Only clientX is ever read, so the gesture is horizontal by
       construction — the strip's own vertical movement was the browser's,
       not this, and is shut off in highlights.css. */
    let dragging = false, startX = 0, startScroll = 0, pointer = null
    track.addEventListener('pointerdown', e => {
      dragging = true
      pointer = e.pointerId
      startX = e.clientX
      startScroll = track.scrollLeft
      track.setPointerCapture(e.pointerId)
      track.classList.add('is-dragging')
    })
    track.addEventListener('pointermove', e => {
      if(!dragging || e.pointerId !== pointer) return
      /* a mouse released outside the window never reports its pointerup */
      if(e.pointerType === 'mouse' && e.buttons === 0) return endDrag()
      e.preventDefault()
      track.scrollLeft = startScroll - (e.clientX - startX)
    })
    const endDrag = () => { dragging = false; pointer = null; track.classList.remove('is-dragging') }
    track.addEventListener('pointerup', endDrag)
    track.addEventListener('pointercancel', endDrag)
    /* a drag that starts on a card must not become a native image drag */
    track.addEventListener('dragstart', e => e.preventDefault())

    /* the "progress bar" is actually a draggable stick/handle on a rail —
       not a fill that grows. Its position mirrors the track's scroll
       fraction, and dragging it scrubs the track directly. */
    /* On a screen wide enough to show the whole strip there is nothing to
       scrub: the arrows do nothing and the rail is a full bar that can't
       move. Hide the lot rather than leave dead controls sitting there. */
    const nav = root.querySelector('.hl-nav')
    const syncNav = () => nav?.toggleAttribute('hidden',
      track.scrollWidth <= track.clientWidth + 1)
    syncNav()
    if(window.ResizeObserver) new ResizeObserver(syncNav).observe(track)

    const rail = root.querySelector('.hl-progress')
    const handle = root.querySelector('.hl-progress-fill')
    if(!rail || !handle) return

    const room = () => Math.max(0, rail.clientWidth - handle.offsetWidth)
    const maxScroll = () => Math.max(0, track.scrollWidth - track.clientWidth)

    const syncHandle = () => {
      const max = maxScroll()
      const pct = max > 0 ? track.scrollLeft / max : 0
      handle.style.left = `${pct * room()}px`
    }
    track.addEventListener('scroll', syncHandle, { passive:true })
    syncHandle()

    const scrubTo = clientX => {
      const rect = rail.getBoundingClientRect()
      const x = Math.min(Math.max(clientX - rect.left - handle.offsetWidth / 2, 0), room())
      const r = room()
      track.scrollLeft = (r > 0 ? x / r : 0) * maxScroll()
    }

    let scrubbing = false
    handle.addEventListener('pointerdown', e => {
      scrubbing = true
      handle.setPointerCapture(e.pointerId)
    })
    handle.addEventListener('pointermove', e => { if(scrubbing) scrubTo(e.clientX) })
    handle.addEventListener('pointerup', () => { scrubbing = false })
    handle.addEventListener('pointercancel', () => { scrubbing = false })
    /* clicking the rail itself (not the handle) jumps the handle there */
    rail.addEventListener('pointerdown', e => { if(e.target === rail) scrubTo(e.clientX) })
  },
}
