/* ============================================================
   FLAPBOARD
   A Solari split-flap display. General-purpose rather than tied
   to one logo, because it's wanted at several sizes and for
   different text.

     Flapboard.mount(el, 'FINAL CALL')
     Flapboard.mount(el, '21 DAYS', { tick: 45, stagger: 70 })
     board.set('ARE U IN?')
     board.setTiming({ tick: 60 })     // either dial, independently
     Flapboard.mountAll(root)          // every [data-flap]

   Two timing dials, deliberately separate:
     tick     how long one fold takes, and how often a tile flaps
     stagger  the delay between neighbouring tiles — the wave

   `flipSpaces` makes blank slots turn before landing empty, so a
   board can churn and resolve to nothing. `flipChance` thins that
   out — .3 means roughly a third of the blanks bother.

   `set()` takes an `onSettle` callback and records `settleMs`, so a
   sequence can wait for the board to actually land.

   `glyphs` maps a character to markup, so a slot can hold an icon:
     Flapboard.mount(el, 'FUCK*YOU!', { glyphs: { '*': ICON_SVG } })
   The icon flips like any other flap, splitting across the hinge.

   Each tile is four layers, which is what the 3D fold needs:

     .flap-top     static, shows the INCOMING character
     .flap-bottom  static, shows the OUTGOING one
     .flap-front   leaf that falls away, carrying the outgoing top
     .flap-back    leaf that swings down, carrying the incoming bottom

   Styling lives in styles/flapboard.css; sizes all derive from
   --flap-h, so the same markup works at any scale.
   ============================================================ */

const DEFAULT_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789?!&.,:-/ '
const REDUCED = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const nbsp = c => (c === ' ' ? '\u00A0' : c)

export const Flapboard = {
  mount(el, text, opts = {}){
    if(!el) return null
    const board = new Board(el, opts)
    board.set(text, { immediate: true })
    return board
  },

  mountAll(root = document, opts = {}){
    return [...root.querySelectorAll('[data-flap]')].map(el =>
      this.mount(el, el.dataset.flap || el.textContent.trim(), {
        ...opts,
        tick:    +el.dataset.flapTick    || opts.tick,
        stagger: +el.dataset.flapStagger || opts.stagger,
        cycles:  +el.dataset.flapCycles  || opts.cycles,
        length:  +el.dataset.flapLength   || opts.length,
      }))
  },
}

class Board {
  constructor(el, opts = {}){
    this.el      = el
    this.charset = (opts.charset ?? DEFAULT_CHARSET).toUpperCase()
    this.tick    = opts.tick    ?? 105   /* ms between flaps — matches --flap-speed */
    this.stagger = opts.stagger ?? 60    /* ms between neighbouring tiles */
    this.cycles  = opts.cycles  ?? 5     /* flaps before a tile settles */
    /* A board has a fixed number of slots, like a real one. Text longer than
       that is cropped; shorter is padded with blank flaps. Without this the
       board would resize on every update, which is exactly what a mechanical
       display can't do. */
    this.length  = opts.length ?? null   /* null = take it from the first text */
    /* A space normally lands instantly — there's nothing to show. Set this to
       let blanks churn through characters first, which is what makes a whole
       wall of flaps resolve to almost nothing. */
    this.flipSpaces = opts.flipSpaces ?? false
    /* How many blank slots actually turn, 0-1. A wall of flaps all churning at
       once is noise and a lot of animation; a scattered few reads as a board
       idling, and costs a fraction as much. */
    this.flipChance = opts.flipChance ?? 1
    /* Slots that render markup instead of a character. Keyed by the character
       used in the text, so 'FUCK*YOU!' with glyphs {'*': '<svg…>'} puts an icon
       in the middle slot and everything else behaves normally. The markup is
       authored here, not user input, so innerHTML is safe. */
    this.glyphs = opts.glyphs ?? null
    this.tiles   = []
    this.timers  = []

    el.classList.add('flapboard')
    el.setAttribute('role', 'img')
    this.applyTiming()
  }

  /* A tile per character, spaces included — on a real board a space is a blank
     flap, not a gap, and keeping it preserves the rhythm. */
  build(len){
    this.el.innerHTML = ''
    this.tiles = Array.from({ length: len }, () => {
      const tile = document.createElement('span')
      tile.className = 'flap-tile'
      tile.innerHTML =
        '<span class="flap-half flap-top"><span class="flap-glyph"></span></span>' +
        '<span class="flap-half flap-bottom"><span class="flap-glyph"></span></span>' +
        '<span class="flap-leaf flap-front"><span class="flap-glyph"></span></span>' +
        '<span class="flap-leaf flap-back"><span class="flap-glyph"></span></span>' +
        '<span class="flap-axle"></span>'          /* the two side pins */
      this.el.appendChild(tile)
      return {
        tile,
        top:    tile.querySelector('.flap-top .flap-glyph'),
        bottom: tile.querySelector('.flap-bottom .flap-glyph'),
        front:  tile.querySelector('.flap-front .flap-glyph'),
        back:   tile.querySelector('.flap-back .flap-glyph'),
        char:   ' ',
      }
    })
  }

  /* `tick` is how long one fold takes AND how often a tile flaps, so it has to
     reach the CSS as well — otherwise the animation duration and the cadence
     drift apart and tiles start folding over themselves. */
  applyTiming(){
    this.el.style.setProperty('--flap-speed', this.tick + 'ms')
  }

  /* change either dial independently, at any time */
  setTiming({ tick, stagger } = {}){
    if(tick != null)    this.tick = tick
    if(stagger != null) this.stagger = stagger
    this.applyTiming()
    return this
  }

  clear(){
    this.timers.forEach(clearTimeout)
    this.timers = []
    /* A pending rAF hasn't created its timers yet, so clearing the timers alone
       let a previous set() schedule itself AFTER the new one — two sequences
       running at once, which showed up as a couple of tiles turning, a pause,
       then everything snapping into step. */
    if(this.raf != null){
      cancelAnimationFrame(this.raf)
      this.raf = null
    }
    /* Cancelling also kills the timers that were going to strip .is-flipping,
       which would leave those tiles stuck mid-fold. */
    this.tiles.forEach(t => t.tile.classList.remove('is-flipping'))
  }

  set(text, { immediate = false, onSettle = null } = {}){
    text = String(text).toUpperCase()

    /* the first text fixes the slot count unless one was given up front */
    if(this.length == null) this.length = text.length
    const label = text.slice(0, this.length)
    text = label.padEnd(this.length, ' ')

    this.clear()
    if(this.tiles.length !== this.length) this.build(this.length)
    this.el.setAttribute('aria-label', label.trim() || ' ')

    /* Motion is decoration; the text is the content. Anyone who's asked for
       less of it just gets the words. */
    if(immediate === 'silent' || REDUCED()){
      this.tiles.forEach((t, i) => this.settle(t, text[i]))
      this.settleMs = 0
      onSettle?.()
      return
    }

    /* How long the whole board takes to land. Callers need this: a sequence
       that waits a fixed time from the START of a flip can change the message
       before anyone has read it. */
    this.settleMs = 0

    /* Scheduling is deferred by a frame. A tile flipped at t=0 has just been
       inserted and hasn't been laid out, so the class add / reflow / class add
       that restarts the animation has nothing to restart — which is why the
       first tile always looked wrong while the rest were fine. */
    const schedule = () => this.tiles.forEach((t, i) => {
      const target = text[i]

      /* A slot that CHANGES always turns, blank or not. Skipping the animation
         for a blank target meant a tile holding 'F' would snap to empty while
         its neighbours flipped — which reads as a bug, not a board. Only a
         blank that was already blank is allowed to sit still. */
      const wasBlank = t.char === ' '
      const isBlank  = target === ' '
      if(isBlank && wasBlank && (!this.flipSpaces || Math.random() > this.flipChance)){
        this.settle(t, ' ')
        return
      }

      const start = i * this.stagger
      /* Later tiles run on a little longer, so the board lands as a wave. The
         extra is capped — on a 31-slot wall row an uncapped ramp added 15 more
         flaps to the last tile and the whole thing took nine seconds. */
      const flaps = this.cycles + Math.min(8, Math.floor(i / 2))

      for(let n = 0; n < flaps; n++)
        this.timers.push(setTimeout(() => this.flip(t, this.random()), start + n * this.tick))

      const lands = start + flaps * this.tick
      this.settleMs = Math.max(this.settleMs, lands + this.tick)
      this.timers.push(setTimeout(() => this.flip(t, target), lands))
    })

    if(typeof requestAnimationFrame === 'function'){
      this.raf = requestAnimationFrame(() => { this.raf = null; schedule() })
    } else schedule()

    if(onSettle) this.timers.push(setTimeout(onSettle, this.settleMs))
  }

  /* Writes one face. A glyph slot gets markup; everything else gets text.
     Both halves of a tile draw the SAME content and crop it, so an icon splits
     across the hinge exactly as a letter does. */
  paint(node, char){
    const svg = this.glyphs?.[char]
    if(svg){
      node.innerHTML = svg
      node.classList.add('is-icon')
    } else {
      node.textContent = nbsp(char)
      node.classList.remove('is-icon')
    }
  }

  /* no animation — used for spaces and reduced-motion */
  settle(t, char){
    t.char = char
    this.paint(t.top, char)
    this.paint(t.bottom, char)
    t.tile.classList.remove('is-flipping')
  }

  /* One fold. The static top switches to the incoming character straight away
     because the falling front leaf hides it; the static bottom only catches up
     once the back leaf has landed on it. */
  flip(t, next){
    const prev = t.char
    this.paint(t.front,  prev)
    this.paint(t.back,   next)
    this.paint(t.top,    next)
    this.paint(t.bottom, prev)
    t.char = next

    t.tile.classList.remove('is-flipping')
    void t.tile.offsetWidth          /* restart the animation */
    t.tile.classList.add('is-flipping')

    this.timers.push(setTimeout(() => {
      this.paint(t.bottom, next)
      t.tile.classList.remove('is-flipping')
    }, this.tick - 5))
  }

  random(){
    return this.charset[Math.floor(Math.random() * this.charset.length)]
  }

  /* Occasional single flaps, long after the board has settled — a real board
     is never quite still. Only touches blank slots, so the message is safe. */
  idle({ every = 2600, chance = 0.5 } = {}){
    clearInterval(this.idleTimer)
    this.idleTimer = setInterval(() => {
      if(document.hidden || Math.random() > chance) return
      const blanks = this.tiles.filter(t => t.char === ' ')
      if(!blanks.length) return
      const t = blanks[Math.floor(Math.random() * blanks.length)]
      /* flip() drives all four faces, so both halves of the tile turn — a
         tile whose bottom moves without its top reads as broken */
      this.flip(t, this.random())
      setTimeout(() => this.flip(t, ' '), this.tick * 2)
    }, every)
    return this
  }

  stopIdle(){ clearInterval(this.idleTimer) }

  destroy(){
    clearInterval(this.idleTimer)
    this.clear()
    this.el.innerHTML = ''
    this.el.classList.remove('flapboard')
  }
}
