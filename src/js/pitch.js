import { TRIP, tripAsset } from './data.js'

/* ============================================================
   PITCH
   The argument for whichever itinerary is selected — three slides
   between the map and the numbers.

     mood       what it feels like
     arguments  three claims, each on a card you turn over
     gem        one moment, held singular

   Mood and arguments run together as one continuous scroll. The gem
   then STACKS, and so do the two blocks after it in the footer:
   each is a step lighter than the last, sea -> #8FA1BC -> #D5DDE8 ->
   white, so the page walks itself into daylight by the time it asks
   the question. Stacking only reads when a slide visibly covers the
   one beneath — which is why the earlier all-blue stack did nothing.

   Optional. An itinerary with no `pitch` renders nothing at all
   rather than an empty section — see TRIP_SCHEMA.md.
   ============================================================ */

const TITLE = 'Three reasons to come:'

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
            <span class="rc-hint" aria-hidden="true">TAP TO REVEAL</span>
          </span>
          <span class="rc-face rc-back">
            ${a.image ? `<span class="rc-print"><img src="${tripAsset(a.image)}" alt="" loading="lazy"></span>` : ''}
            <span class="rc-body">${a.body ?? ''}</span>
          </span>
        </span>
      </button>`).join('')

    /* mood and the cards in one flowing block, the gem on its own after it */
    this.el.innerHTML = `
      <section class="p-slide p-open">
        <div class="p-inner">
          ${p.mood?.headline ? `
            <h2 class="p-headline">${p.mood.headline}</h2>
            ${p.mood.body ? `<p class="p-body">${p.mood.body}</p>` : ''}` : ''}
          ${cards ? `
            <h4 class="p-title">${TITLE}</h4>
            <div class="rc-row">${cards}</div>` : ''}
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

/* Prints thrown across the slide, behind the words. Fixed angles rather than
   random: random re-rolls on every render and never settles into a composition
   you can judge. */
const SCATTER = [
  { x:'62%', y:'6%',  w:'26%', r:'7deg'   },
  { x:'-6%', y:'52%', w:'24%', r:'-9deg'  },
  { x:'74%', y:'64%', w:'20%', r:'-5deg'  },
  { x:'4%',  y:'12%', w:'18%', r:'11deg'  },
]

function prints(images){
  if(!images?.length) return ''
  return `<div class="p-prints" aria-hidden="true">${images.map((src, i) => {
    const s = SCATTER[i % SCATTER.length]
    return `<figure class="p-print" style="left:${s.x};top:${s.y};width:${s.w};--r:${s.r}">
      <img src="${tripAsset(src)}" alt="" loading="lazy">
    </figure>`
  }).join('')}</div>`
}

function slide(kind, data, cls){
  if(!data?.headline) return ''
  return `
    <section class="p-slide ${cls}">
      ${prints(data.images)}
      <div class="p-inner">
        ${data.label ? `<p class="p-label">${data.label}</p>` : ''}
        <h2 class="p-headline">${data.headline}</h2>
        ${data.body ? `<p class="p-body">${data.body}</p>` : ''}
      </div>
    </section>`
}
