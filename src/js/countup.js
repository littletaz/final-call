/* ============================================================
   COUNT-UP
   Animates the dataviz numbers when they scroll into view.
   Runs once per element; re-rendering the stats re-arms it.
   ============================================================ */

const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ease-out cubic — fast start, gentle settle */
const ease = t => 1 - Math.pow(1 - t, 3)

function animate(el, to, duration = 1100){
  const from = 0
  const start = performance.now()

  function frame(now){
    const t = Math.min(1, (now - start) / duration)
    el.textContent = Math.round(from + (to - from) * ease(t))
    if(t < 1) requestAnimationFrame(frame)
    else el.textContent = to
  }
  requestAnimationFrame(frame)
}

export function countUp(nodes){
  const els = [...nodes]
  if(!els.length) return

  if(REDUCED || !('IntersectionObserver' in window)){
    els.forEach(el => el.textContent = el.dataset.countTo)
    return
  }

  const io = new IntersectionObserver((entries, obs) => {
    for(const e of entries){
      if(!e.isIntersecting) continue
      const el = e.target
      obs.unobserve(el)
      /* stagger so the four numbers don't tick in perfect lockstep */
      const i = els.indexOf(el)
      setTimeout(() => animate(el, +el.dataset.countTo), i * 90)
    }
  }, { threshold: 0.6 })

  els.forEach(el => io.observe(el))
}
