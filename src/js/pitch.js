import { TRIP } from './data.js'

/* ============================================================
   PITCH
   The argument for whichever itinerary is selected — three slides
   between the map and the numbers.

     mood       what it feels like
     arguments  three claims, each on a card you turn over
     gem        one moment, held singular

   The slides STACK: each sticks to the top of the viewport while
   the next rides up over it, so you get three deliberate beats
   rather than three screens of scrolling.

   Optional. An itinerary with no `pitch` renders nothing at all
   rather than an empty section — see TRIP_SCHEMA.md.
   ============================================================ */

const TITLE = 'Three reasons to come.'

export const Pitch = {
  el: null,

  init(){
    this.el = document.getElementById('pitch')
    return this
  },

  render(itinerary){
    if(!this.el) return
    const p = itinerary?.pitch
    if(!p?.mood && !p?.arguments?.length && !p?.gem){
      this.el.innerHTML = ''
      this.el.hidden = true
      return
    }
    this.el.hidden = false

    const cards = (p.arguments ?? []).map((a, i) => `
      <button class="rc" type="button" style="--i:${i}" aria-expanded="false">
        <span class="rc-inner">
          <span class="rc-face rc-front">
            <span class="rc-num">${i + 1}</span>
            <span class="rc-headline">${a.headline ?? ''}</span>
            <span class="rc-hint" aria-hidden="true">tap</span>
          </span>
          <span class="rc-face rc-back">
            <span class="rc-body">${a.body ?? ''}</span>
          </span>
        </span>
      </button>`).join('')

    this.el.innerHTML = `
      ${slide('mood', p.mood, 'p-mood')}

      <section class="p-slide p-reasons">
        <div class="p-inner">
          <h2 class="p-title">${TITLE}</h2>
          <div class="rc-row">${cards}</div>
        </div>
      </section>

      ${slide('gem', p.gem, 'p-gem')}`

    /* Turned over for good. Someone who spent a click to read it shouldn't
       lose it by touching the screen again. */
    this.el.querySelectorAll('.rc').forEach(card => {
      card.addEventListener('click', () => {
        if(card.classList.contains('is-open')) return
        card.classList.add('is-open')
        card.setAttribute('aria-expanded', 'true')
      })
    })

    /* each slide arrives as it comes into view, once */
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        if(e.isIntersecting){
          e.target.classList.add('is-in')
          io.unobserve(e.target)
        }
      })
    }, { threshold: 0.25 })
    this.el.querySelectorAll('.p-slide').forEach(s => io.observe(s))
  },
}

function slide(kind, data, cls){
  if(!data?.headline) return ''
  return `
    <section class="p-slide ${cls}">
      <div class="p-inner">
        <h2 class="p-headline">${data.headline}</h2>
        ${data.body ? `<p class="p-body">${data.body}</p>` : ''}
      </div>
    </section>`
}
