/* ============================================================
   SCROLL
   scrollIntoView({behavior:'smooth'}) gives no control over
   duration or curve, so we drive it ourselves.
   ============================================================ */

const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* easeInOutQuad */
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

export function scrollToEl(el, duration = 230){
  if(!el) return
  const target = el.getBoundingClientRect().top + window.scrollY

  if(REDUCED){ window.scrollTo(0, target); return }

  const from  = window.scrollY
  const delta = target - from
  if(Math.abs(delta) < 1) return

  const start = performance.now()
  function frame(now){
    const t = Math.min(1, (now - start) / duration)
    window.scrollTo(0, from + delta * ease(t))
    if(t < 1) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
