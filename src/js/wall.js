import { Flapboard } from './flapboard.js'

/* ============================================================
   WALL
   A board of flaps filling its container. Used for the footer's
   closing question, and it carries the whole NO sequence — which
   is why there's no longer a separate page for it: the joke works
   because the board you're already looking at changes its mind.

   Built lazily. Nothing exists until the caller says so, because
   ~120 tiles is ~600 elements and there's no reason to carry them
   while someone is still reading the trip.
   ============================================================ */

const FINGER = `<svg viewBox="0 0 61.66 87.68" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M55.28,30.51c-1.14-1.41-2.7-2.44-4.46-2.95-1.76-.52-3.63-.5-5.38.06l-1.43-1.09c-1.09-.82-2.38-1.36-3.74-1.55-1.36-.2-2.75-.05-4.03.43l1.07-15.85c.09-1.34-.35-2.67-1.24-3.7-.89-1.03-2.16-1.67-3.52-1.79-1.37-.12-2.73.28-3.8,1.13-1.07.85-1.75,2.07-1.91,3.41l-2.15,16.13c-1.32-.82-2.86-1.24-4.42-1.19s-3.07.54-4.34,1.44c-.11.07-.2.17-.27.28-.07.11-.12.23-.14.36l-2.08,10.78-5.34.34c-.24.02-.46.11-.63.27-.17.16-.28.37-.31.6l-1.61,13.23c-.02.15,0,.29.05.43.05.14.13.27.23.37l9.94,10.14-2.57,19.36c-.02.14,0,.28.03.41.04.13.11.26.2.36.09.11.2.19.33.25.13.06.27.09.41.1l31.83.76c.14,0,.27-.02.4-.07.13-.05.24-.13.34-.22.1-.1.17-.21.22-.33.05-.12.08-.26.07-.39l-.47-16.96,2.47-1.77c1.61-1.16,2.94-2.65,3.88-4.38.94-1.73,1.48-3.64,1.57-5.59l1.05-22.09c0-.13-.01-.26-.06-.38-.05-.12-.12-.24-.21-.33ZM21.6,73c-.02.09-.05.17-.1.24-.05.07-.11.14-.18.18-.07.05-.16.08-.24.1-.09.02-.18.02-.26,0-.09-.02-.17-.05-.24-.1-.07-.05-.14-.11-.19-.18-.05-.07-.08-.15-.1-.24-.02-.09-.02-.17,0-.26l1.99-10.23c.02-.09.05-.17.1-.24.05-.07.11-.14.19-.18.07-.05.16-.08.24-.1.09-.02.18-.02.26,0,.09.02.17.05.24.1.07.05.14.11.19.18.05.07.08.15.1.24.02.09.02.17,0,.26l-1.99,10.23ZM26.49,73.07c-.02.09-.05.17-.1.24-.05.07-.11.13-.19.18-.07.05-.16.08-.24.1-.09.02-.18.02-.26,0-.09-.02-.17-.05-.24-.1-.07-.05-.14-.11-.19-.18-.05-.07-.08-.15-.1-.24-.02-.09-.02-.17,0-.26l1.1-5.39c.04-.17.14-.32.29-.42.15-.1.33-.13.51-.1.18.03.33.14.43.28.1.15.13.32.1.5l-1.1,5.39ZM34.09,25.26c0,.09-.04.17-.08.25-.04.08-.1.14-.17.2-.07.05-.15.1-.23.12-.08.02-.17.03-.26.02l-5.86-.51c-.09,0-.18-.03-.26-.07s-.15-.1-.21-.16c-.06-.07-.1-.15-.13-.23-.03-.08-.04-.17-.03-.26,0-.09.04-.17.08-.25.04-.08.1-.15.17-.2.07-.05.15-.09.24-.12s.18-.03.27-.02l5.86.51c.09,0,.17.03.25.08.08.04.15.1.2.16.06.07.1.15.12.23.03.08.03.17.02.26ZM35.04,16.45c0,.09-.04.17-.08.25-.04.08-.1.14-.17.2-.07.05-.15.1-.23.12-.08.02-.17.03-.26.02l-5.86-.51c-.17-.02-.33-.11-.44-.25-.11-.14-.16-.31-.14-.48.02-.17.1-.33.24-.44.13-.11.31-.16.48-.15l5.86.51c.18.02.34.1.45.24.11.14.17.31.15.49ZM35.19,12.11c0,.18-.09.34-.22.46-.13.12-.31.18-.49.17l-5.38-.28c-.18,0-.35-.09-.47-.22-.12-.13-.18-.3-.17-.48l.17-2.99c.04-.78.4-1.51,1-2.03.59-.52,1.37-.79,2.17-.75.51-.05,1.03.02,1.51.2.48.18.92.45,1.28.82.26.29.47.62.6.99.13.37.19.75.16,1.14l-.17,2.99Z"/></svg>`

/* what the board says, in order */
export const SCRIPT = {
  ask:   'ARE U IN?',
  no:    'FUCK*YOU!',
  taunt: 'U POOR?',
}

export class Wall {
  constructor(el, { tile = 122, overlap = 2, rows = null } = {}){
    this.el = el
    this.tile = tile
    this.overlap = overlap
    this.fixedRows = rows      /* null = fill the container */
    this.boards = []
    this.built = false
  }

  /* Sized to the CONTAINER, not the viewport — the footer's wall is a section
     of a page, unlike a full-screen one. */
  /* `silent` lays the tiles out without animating — used so the wall exists
     long before it's revealed, instead of appearing all at once. */
  build(message = SCRIPT.ask, { silent = false } = {}){
    const box = this.el.getBoundingClientRect()
    const w = this.tile * 0.689
    const h = this.tile

    let cols = Math.ceil((box.width || window.innerWidth) / (w - this.overlap)) + 1
    /* A fixed row count is deliberate: five rows, with the first and last
       half-cut by the container, reads as a fragment of a much bigger board.
       A wall sized to fill the viewport just looks like a background. */
    let rows = this.fixedRows
      ?? Math.ceil((box.height || window.innerHeight) / (h - this.overlap)) + 1
    /* an even row count has no middle, and an odd remainder can't centre */
    if((cols - message.length) % 2 !== 0) cols += 1
    if(rows % 2 === 0) rows += 1

    this.cols = cols
    this.mid  = (rows - 1) / 2
    this.el.style.setProperty('--wall-tile', h + 'px')
    this.el.style.setProperty('--wall-rows', rows)
    this.el.innerHTML = ''

    this.boards = Array.from({ length: rows }, (_, r) => {
      const row = document.createElement('div')
      row.className = 'wall-row' + (r === this.mid ? ' is-message' : '')
      this.el.appendChild(row)

      if(r === this.mid){
        this.messageBoard = Flapboard.mount(row, silent ? ' ' : this.centred(message), {
          length: cols, tick: 105, stagger: 46, cycles: 8, glyphs: { '*': FINGER },
        })
        return this.messageBoard
      }
      /* scenery: a scattered few turn during the churn, then stop */
      return Flapboard.mount(row, ' ', {
        length: cols, tick: 105, stagger: 30, cycles: 4,
        flipSpaces: !silent, flipChance: 0.22,
      })
    })
    this.built = true
    return this
  }

  centred(text){
    const pad = Math.max(0, Math.floor((this.cols - text.length) / 2))
    return ' '.repeat(pad) + text
  }

  /* resolves once the board has actually landed on the new text */
  say(text){
    return new Promise(resolve => {
      if(!this.messageBoard) return resolve()
      this.messageBoard.set(this.centred(text), { onSettle: resolve })
    })
  }

  destroy(){
    this.boards.forEach(b => b.destroy())
    this.el.innerHTML = ''
    this.built = false
  }
}
