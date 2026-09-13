import { TRIP, tripAsset, stopDates, handFontHasNoAccents, stripEAccents } from './data.js'
import { MapView } from './map.js'
import { ItineraryModal } from './itinerary.js'

/* ============================================================
   TIMELINE
   Matches the Figma "Timeline" component (node 132:610): a card
   showing the current stop, date, and a mini progress track (dots +
   fill + a travelling marker). Dragging the track:
     - highlights the current base stop's pin on the map
     - the route (drawn from public/trips/<id>/img/map/route.svg, the
       same asset the pins are calibrated against) is always fully
       visible in black, and the portion you've travelled colours in
       BY TRANSPORT as you pass it — yellow for the flight, green for
       the ground — with a marker riding the tip of it
     - updates the card's city / date / day live

   The Figma mock's fan of "13j/17j/21j" tabs is NOT built here — those
   are quick-jumps between different itinerary LENGTHS (13-day/17-day/
   21-day trip variants), a feature that doesn't exist yet (only
   full-20 and coach-21 are authored). Add it back once it does.

   Scope, deliberately: scrub → highlight + reveal. Opening a richer
   per-leg detail view (transport, full itinerary) is a later pass —
   the card's top-right link button is a placeholder for it.
   ============================================================ */

const NS = 'http://www.w3.org/2000/svg'

const REDUCED = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ---- what a leg looks like ----------------------------------------------
   Untravelled, every leg is the same black line Figma draws on the map.
   Once you've passed it, it takes the colour of HOW you travelled it — the
   flight yellows in, anything on the ground greens. So the colour is the
   progress, rather than a second faded copy of the same hue.

   Modes come from map.route.legs (see trip.json); anything not a flight is
   ground, which is the sane default for a mode nobody has declared yet. */
const ROUTE_BLACK = '#000'
const LEG_AIR = '#FDC816'
const LEG_GROUND = '#00824B'
/* the untravelled line is the thinner of the two — see mk() */
const ROUTE_W = 5
const ROUTE_W_ACTIVE = 7
const legColor = leg => leg.mode === 'plane' ? LEG_AIR : LEG_GROUND
/* a bare string is shorthand for "this mode, and badge it" */
const readLeg = v => typeof v === 'string' ? { mode: v, badge: true } : (v ?? {})

export const Timeline = {
  root: null, track: null, fill: null, dots: null, marker: null,
  svg: null,
  /* one entry per hop between consecutive base stops — see buildRoute() */
  legs: [], totalLen: 0,
  poiLengths: [],
  ranges: [],
  maxDay: 0,
  cache: null,       /* parsed route.svg, reused across itineraries */

  async init(){
    this.root  = document.getElementById('map-timeline')
    this.card  = this.root?.querySelector('.tl-card')
    this.track = this.root?.querySelector('.tl-track')
    this.fillY = this.track?.querySelector('.tl-track-fill')
    this.dots  = this.root?.querySelector('.tl-dots')
    this.marker = this.root?.querySelector('.tl-marker')
    if(!this.track) return

    this.bindDrag()
    /* The route is generated per itinerary now (see buildRoute), so it is
       built from setItinerary() rather than once here. */
    this.root?.removeAttribute('hidden')

    /* The card shows one day; the arrow opens all of them. */
    ItineraryModal.init()
    this.root?.querySelector('.tl-link')?.addEventListener('click', () => {
      ItineraryModal.open(this.itinerary, this.schedule, this.ranges)
    })
  },

  bindDrag(){
    let dragging = false
    const setFromClientX = clientX => {
      const rect = this.track.getBoundingClientRect()
      const frac = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
      this.scrub(Math.round(Math.min(Math.max(frac, 0), 1) * this.maxDay))
    }
    this.track.addEventListener('pointerdown', e => {
      dragging = true
      this.track.setPointerCapture(e.pointerId)
      setFromClientX(e.clientX)
    })
    this.track.addEventListener('pointermove', e => { if(dragging) setFromClientX(e.clientX) })
    this.track.addEventListener('pointerup', () => { dragging = false })
    this.track.addEventListener('pointercancel', () => { dragging = false })
    this.track.addEventListener('keydown', e => {
      const t = Number(this.track.getAttribute('aria-valuenow') || 0)
      if(e.key === 'ArrowRight') this.scrub(Math.min(t + 1, this.maxDay))
      else if(e.key === 'ArrowLeft') this.scrub(Math.max(t - 1, 0))
      else return
      e.preventDefault()
    })
  },

  /* ---- the route on the map ------------------------------------------------
     DRAWN FROM THE PINS, not from an SVG asset. It used to be one authored
     path (img/map/route.svg) with a fixed five POI marks on it, which meant
     exactly one itinerary could use it: the other two either got a line to
     places they never visit, or — because the POI count had to match the
     base-stop count — lost the scrubber card entirely. Every itinerary now
     gets its own route, because every itinerary already carries what a route
     needs: the coordinates of its base stops, in order.

     The geometry is a quadratic through each pair of consecutive bases,
     bowed perpendicular to the chord so the hops arc like the drawn one
     rather than reading as a bar chart of straight lines. The bow is a
     fraction of each chord's own length, so a short hop curves less than a
     long one and the whole path stays in proportion at any zoom.

     Coordinates are the pins' own, in the BASE IMAGE's pixel space: the
     viewBox is map.baseSize, which is exactly the aspect #world is drawn at,
     so the mapping is uniform and a circle stays a circle. (A 0-100 box
     stretched over the same rect is not: it is 1.45:1 here, which turns the
     marker into an ellipse and breaks the dash pattern the reveal depends
     on into visible segments.) Strokes are therefore in user units, and the
     artwork renders about 1:1 on the desktop canvas.

     Mode per leg comes from the stop you are arriving AT — stops[].arriveBy,
     which every itinerary already declares — so a flight yellows in and a
     drive greens, with no new field to author and nothing to keep in sync. */
  BOW: 0.17,

  async buildRoute(itinerary){
    const host = document.getElementById('pois')
    this.svg?.remove()
    this.svg = null
    this.legs = []
    this.badges = []
    this.totalLen = 0
    this.poiLengths = []
    if(!host || !itinerary) return

    const bases = itinerary.stops.filter(s => !s.spur)
    if(bases.length < 2) return

    const size = TRIP.data.map?.baseSize
    if(!size) return
    const visible = MapView.visible()
    const pts = bases.map(st => {
      const c = TRIP.byId[st.locationId]?.coordinates
      /* a stop pinned on the inset map is not on this canvas */
      return (!c || c.onInset) ? null : { x: c.x * size.w, y: c.y * size.h }
    })
    if(pts.some(p => !p)) return

    /* Trip-owned art for the link icon — set as a CSS custom property (same
       pattern as --sel-panel-img in main.js/main.css) so timeline.css stays
       trip-agnostic. */
    const abs = file => new URL(tripAsset(file), document.baseURI).href
    document.documentElement.style.setProperty(
      '--tl-link-icon', `url('${abs('img/timeline/link-icon.svg')}')`)

    const svg = document.createElementNS(NS, 'svg')
    /* the visible band of the artwork, in the artwork's own pixels — the
       same box #world is drawn at, so no stretch in either axis */
    svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h * visible}`)
    svg.setAttribute('preserveAspectRatio', 'none')
    svg.classList.add('route-layer')
    svg.style.inset = '0'
    svg.style.width = '100%'
    svg.style.height = '100%'

    const mk = (d, color, width) => {
      const p = document.createElementNS(NS, 'path')
      p.setAttribute('d', d)
      p.setAttribute('stroke', color)
      p.setAttribute('stroke-width', width)
      p.setAttribute('stroke-linecap', 'round')
      p.setAttribute('fill', 'none')
      return p
    }

    for(let i = 0; i < pts.length - 1; i++){
      const a = pts[i], b = pts[i + 1]
      const dx = b.x - a.x, dy = b.y - a.y
      /* control point: the chord's midpoint, pushed along the chord's own
         normal. One consistent sign, so every hop bows the same way round
         and the path reads as one journey rather than a zigzag. */
      const cx = (a.x + b.x) / 2 + dy * this.BOW
      const cy = (a.y + b.y) / 2 - dx * this.BOW
      const d = `M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}`

      const mode = bases[i + 1].arriveBy === 'flight' ? 'plane' : 'car'
      const color = legColor({ mode })
      const base = mk(d, ROUTE_BLACK, ROUTE_W)
      const path = mk(d, color, ROUTE_W_ACTIVE)
      svg.append(base, path)
      this.legs.push({ base, path, mode, color, start: 0, len: 0 })
    }

    this.mapMarker = document.createElementNS(NS, 'circle')
    this.mapMarker.setAttribute('r', '9')
    this.mapMarker.setAttribute('fill', '#fff')
    this.mapMarker.setAttribute('stroke', '#1C2321')
    this.mapMarker.setAttribute('stroke-width', '2.5')
    this.mapMarker.classList.add('route-marker')
    svg.appendChild(this.mapMarker)

    host.appendChild(svg)
    this.svg = svg

    /* lengths are only measurable once the paths are in the document */
    let at = 0
    for(const leg of this.legs){
      leg.len = leg.path.getTotalLength()
      leg.start = at
      at += leg.len
      /* The dash pattern is the leg's whole length and never changes — only
         the OFFSET moves, and moving it is what reveals the route. */
      leg.path.setAttribute('stroke-dasharray', leg.len)
      leg.path.setAttribute('stroke-dashoffset', leg.len)
    }
    this.totalLen = at

    /* A base stop sits at the join between its legs, which is a length we
       already know exactly — no nearest-point search needed now the path is
       built from those very points. */
    this.poiLengths = [0, ...this.legs.map(l => l.start + l.len)]

    /* the card's mini-track mirrors the map's colour walk, so it reads its
       stops from the same lengths rather than repeating them. Before the
       badges, because everything past the first await is not guaranteed to
       have run by the time setItinerary() continues. */
    this.trackGradient()

    /* ---- transport badges ----
       Figma pins a 22px disc with a white glyph at the middle of the flight
       arc (node 169:1655): the leg's "how you get there" told in one mark.
       Only flights are badged, as Figma draws it — a drive reads from the
       line's colour alone. */
    for(const leg of this.legs){
      if(leg.mode !== 'plane') continue
      const half = leg.len / 2
      const mid = leg.path.getPointAtLength(half)
      const g = document.createElementNS(NS, 'g')
      g.classList.add('route-badge')
      const disc = document.createElementNS(NS, 'circle')
      disc.setAttribute('cx', mid.x); disc.setAttribute('cy', mid.y)
      disc.setAttribute('r', '11.2')        /* 22px across on the 1440 canvas */
      disc.setAttribute('fill', ROUTE_BLACK)
      g.appendChild(disc)

      /* The glyph is INLINED rather than referenced as an <image>, because it
         has to recolour: an external image can't be restyled from here, and
         the icon turns its leg's colour once you've travelled past it. */
      const glyph = await this.loadGlyph(leg.mode)
      if(glyph){
        glyph.setAttribute('transform',
          `translate(${mid.x - 6} ${mid.y - 6}) scale(${12 / glyph.dataset.span})`)
        g.appendChild(glyph)
      }
      svg.appendChild(g)
      this.badges.push({ el: g, disc, at: leg.start + half, color: leg.color })
    }
  },

  /* The mini-track is the route seen end-on, so it carries the same colours
     in the same proportions: one gradient with a hard stop at every leg
     boundary. Built here rather than as two fixed spans, which could only
     ever describe a two-leg trip. */
  trackGradient(){
    if(!this.fillY || !this.totalLen) return
    const stops = this.legs.flatMap(l => {
      const a = (l.start / this.totalLen * 100).toFixed(3)
      const b = ((l.start + l.len) / this.totalLen * 100).toFixed(3)
      return [`${l.color} ${a}%`, `${l.color} ${b}%`]
    })
    this.fillY.style.background = `linear-gradient(to right, ${stops.join(',')})`
  },

  /* Fetches one transport glyph and hands back a <g> of its contents, with
     every fill swapped for currentColor so the badge can recolour it. The
     files are the Figma 'transport' component set (node 170:2458), each a
     white shape on its own viewBox; data-span is that viewBox's long edge,
     which is all the caller needs to scale it. Cached — the same mode can
     appear on more than one leg. */
  async loadGlyph(mode){
    this.glyphs ??= new Map()
    if(!this.glyphs.has(mode)){
      this.glyphs.set(mode, (async () => {
        try{
          const res = await fetch(tripAsset(`img/transport/${mode}.svg`))
          if(!res.ok) throw new Error(`HTTP ${res.status}`)
          const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml')
          const root = doc.documentElement
          const vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number)
          const span = Math.max(vb[2] || 0, vb[3] || 0)
            || Math.max(parseFloat(root.getAttribute('width')) || 0,
                        parseFloat(root.getAttribute('height')) || 0)
          const g = document.createElementNS(NS, 'g')
          for(const node of [...root.childNodes]) g.appendChild(node)
          g.querySelectorAll('[fill]').forEach(n => {
            if(n.getAttribute('fill') !== 'none') n.setAttribute('fill', 'currentColor')
          })
          g.dataset.span = span || 1
          return g
        }catch(e){
          console.warn(`[final-call] missing asset: img/transport/${mode}.svg — no badge glyph`)
          return null
        }
      })())
    }
    const proto = await this.glyphs.get(mode)
    return proto ? proto.cloneNode(true) : null
  },

  /* Which leg a length falls on, and where along it. Clamped at both ends so
     the marker parks on the first/last pin rather than vanishing. */
  pointAt(len){
    if(!this.legs.length) return { x:0, y:0 }
    const clamped = Math.max(0, Math.min(len, this.totalLen))
    for(const leg of this.legs){
      if(clamped <= leg.start + leg.len)
        return leg.path.getPointAtLength(clamped - leg.start)
    }
    const last = this.legs[this.legs.length - 1]
    return last.path.getPointAtLength(last.len)
  },

  /* Rebuilds day ranges, the mini-track's dots, and the quick-jump tabs
     for the active itinerary — base stops only, day offsets from
     stopDates() so this can never drift from the dates shown elsewhere. */
  setItinerary(itinerary){
    const bases = itinerary.stops.filter(s => !s.spur)

    /* The route is this itinerary's own now, generated from its stops, so it
       is rebuilt on every switch. It is also awaited nowhere: buildRoute's
       only async step is fetching a transport glyph for a badge, and the
       line, the lengths and the card are all in place before that resolves.
       Everything below reads this.poiLengths, which buildRoute has already
       written synchronously. */
    this.buildRoute(itinerary)

    if(!this.legs.length || bases.length !== this.poiLengths.length){
      /* Fewer than two base stops, or a stop with no coordinates on this
         canvas — there is no line to scrub along. Hide the CARD, not the
         whole container, so #length-tabs (a sibling inside it) stays usable
         to switch to a variant that does work. */
      this.card?.toggleAttribute('hidden', true)
      return
    }
    this.card?.removeAttribute('hidden')

    const dates = stopDates(itinerary)
    const start = itinerary.dateRange?.start ? new Date(itinerary.dateRange.start + 'T00:00:00') : null
    const dayOf = date => start ? Math.round((date - start) / 86400000) : 0

    this.itinerary = itinerary
    this.ranges = bases.map((s, i) => {
      const dr = dates[s.locationId]
      return {
        locationId: s.locationId,
        length: this.poiLengths[i],
        start: dr ? dayOf(dr.from) : i,
        end: dr ? dayOf(dr.to) : i,
      }
    })
    this.maxDay = Math.max(itinerary.days - 1, this.ranges.at(-1)?.end ?? 0)
    this.schedule = this.buildSchedule(itinerary)
    this.routeLen = null

    this.renderDots()
    this.track.setAttribute('aria-valuemax', this.maxDay)
    this.scrub(0)
  },

  /* ---- the day plan -------------------------------------------------------
     A trip is a sequence of STAYS, not a smooth glide along a line. You are
     in Sydney for eight days and then you fly, and the flight is one of
     those days. The old model interpolated the marker from one base stop to
     the next across every day in between, which meant eight days in Sydney
     were spent crawling across the Tasman Sea, and the flight — the only day
     you actually travel — had no moment of its own.

     So every day now resolves to an entry: the base you're sleeping at, and
     optionally where you actually WENT that day. The route only advances
     when the base changes; a day trip moves the card and the map's active
     pin without moving the route at all, which is what being in Sydney on
     day 2 really looks like.

     itinerary.dayPlan authors this directly, one entry per day:
         { "at": "blue-mountains" }                   a day trip out of the
                                                      stay it belongs to
         { "at": "sydney", "place": "Bondi Beach" }   a named day in the stay
     `at` takes any locationId — a base or one of its day trips, which is how
     the entry knows whether the route should move.

     Without a dayPlan it's derived from what the stops already say: each base
     fills its own nights, and its day trips are spread evenly through them,
     skipping the arrival day. That's a guess about WHICH day each trip falls
     on — the only thing dayPlan really pins down — but it's a much better one
     than pretending you spent a week mid-flight. */
  buildSchedule(itinerary){
    const baseOf = new Map(this.ranges.map((r, i) => [r.locationId, i]))
    const idxForDay = day => {
      let idx = 0
      this.ranges.forEach((r, i) => { if(day >= r.start) idx = i })
      return idx
    }

    const schedule = Array.from({ length: this.maxDay + 1 }, (_, day) => ({
      baseIdx: idxForDay(day), spurId: null, place: null,
    }))

    const authored = itinerary.dayPlan
    if(Array.isArray(authored) && authored.length){
      authored.forEach((entry, day) => {
        const slot = schedule[day]
        if(!slot || !entry) return
        slot.place = entry.place ?? null
        const at = entry.at
        if(at == null) return
        if(baseOf.has(at)) slot.baseIdx = baseOf.get(at)
        else {
          /* a day trip: the stay it hangs off is where you still sleep */
          const spur = itinerary.stops.find(s => s.spur && s.locationId === at)
          slot.spurId = at
          if(spur && baseOf.has(spur.spurFrom)) slot.baseIdx = baseOf.get(spur.spurFrom)
        }
      })
      return schedule
    }

    for(const [i, range] of this.ranges.entries()){
      const spurs = itinerary.stops.filter(s => s.spur && s.spurFrom === range.locationId)
      if(!spurs.length) continue
      /* the arrival day is spoken for, so day trips start the day after —
         unless the stay is a single day, when there's nowhere else to put them */
      const first = range.end > range.start ? range.start + 1 : range.start
      const slots = []
      for(let d = first; d <= range.end; d++) if(schedule[d]?.baseIdx === i) slots.push(d)
      if(!slots.length) continue
      spurs.forEach((spur, n) => {
        const day = slots[Math.floor((n + 1) * slots.length / (spurs.length + 1))] ?? slots.at(-1)
        if(schedule[day]) schedule[day].spurId = spur.locationId
      })
    }
    return schedule
  },

  renderDots(){
    if(!this.dots) return
    this.dots.replaceChildren(...this.ranges.map((r, i) => {
      const dot = document.createElement('span')
      dot.className = 'tl-dot'
        + (i === 0 ? ' tl-dot--start' : '')
        + (i === this.ranges.length - 1 ? ' tl-dot--end' : '')
      dot.style.left = `${(r.start / this.maxDay) * 100}%`
      return dot
    }))
  },

  /* The active pin lives as a class on a button MapView owns, so anything
     that rebuilds the pins (the dev tools at boot, crossing the mobile
     breakpoint) drops it. Re-running the current day puts it back. */
  refresh(){ if(this.ranges?.length) this.scrub(this.day ?? 0) },

  /* ---- travelling the leg -------------------------------------------------
     The route only moves on a travel day (see buildSchedule), so this fires
     exactly when you go from one stop to the next — and a leg that used to
     appear all at once now draws itself over a second, with the marker
     riding the tip of it.

     Tweened in JS rather than with a CSS transition because the marker has
     to follow the PATH: transitioning its position would slide it straight
     across the Tasman Sea instead of along the flight arc. One rAF loop
     drives both the dash reveal and the marker, so they can't drift apart.

     Re-targeting mid-flight is the normal case — drag the scrubber and you
     cross several stops — so a new call picks up from wherever the last one
     had got to rather than restarting. */
  ROUTE_MS: 1000,

  drawRoute(len){
    if(!this.legs.length) return
    /* each leg reveals only its own share of the sweep */
    for(const leg of this.legs){
      const done = Math.max(0, Math.min(len - leg.start, leg.len))
      leg.path.setAttribute('stroke-dashoffset', leg.len - done)
    }
    const p = this.pointAt(len)
    this.mapMarker.setAttribute('cx', p.x)
    this.mapMarker.setAttribute('cy', p.y)

    /* Once the reveal has swept past a badge the mark inverts: the disc
       takes the leg's colour and the glyph goes black, so a flight you've
       already made reads as a yellow chip on the yellow line rather than a
       black dot punched through it. */
    for(const b of this.badges ?? []){
      const done = len >= b.at
      b.disc.setAttribute('fill', done ? b.color : ROUTE_BLACK)
      b.el.style.color = done ? ROUTE_BLACK : '#fff'
    }
  },

  animateRoute(target){
    if(!this.legs.length) return
    cancelAnimationFrame(this.routeRaf)

    /* routeLen is null until the first paint of an itinerary, so switching
       variant lands on the new route instead of travelling to it */
    const from = this.routeLen ?? target
    this.routeLen = target
    if(from === target || REDUCED()){ this.drawRoute(target); return }

    const t0 = performance.now()
    const step = now => {
      const k = Math.min((now - t0) / this.ROUTE_MS, 1)
      const eased = k < .5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2
      this.drawRoute(from + (target - from) * eased)
      if(k < 1) this.routeRaf = requestAnimationFrame(step)
    }
    this.routeRaf = requestAnimationFrame(step)
  },

  scrub(t){
    if(!this.ranges.length) return
    const day = Math.min(Math.max(t, 0), this.schedule.length - 1)
    this.day = day
    const entry = this.schedule[day] ?? { baseIdx: 0, spurId: null, place: null }
    const current = this.ranges[entry.baseIdx]

    /* Where the route has got to is the BASE's own point, full stop — no
       interpolation towards the next one. A leg is drawn in the single step
       from the last day of one stay to the first day of the next, because
       that is how long it takes. */
    const targetLen = current.length

    this.animateRoute(targetLen)

    /* The pin that lights up is WHERE YOU WENT, which on a day-trip day is
       the day trip, not the town you slept in — so the Blue Mountains dot
       carries the active state on the Blue Mountains day even though the
       route hasn't moved off Sydney. */
    const activeId = entry.spurId ?? current.locationId
    document.querySelectorAll('#pois .poi').forEach(btn =>
      btn.classList.toggle('is-current', btn.dataset.locationId === activeId))

    /* The mini track's own fill — the whole colour walk is painted once as a
       gradient (trackGradient) and revealed by clipping, so the colours stay
       anchored to their legs instead of stretching as the fill grows. */
    const dayFrac = this.maxDay > 0 ? t / this.maxDay : 0
    if(this.fillY)
      this.fillY.style.clipPath = `inset(0 ${((1 - dayFrac) * 100).toFixed(3)}% 0 0)`
    if(this.marker) this.marker.style.left = `${dayFrac * 100}%`
    this.track.setAttribute('aria-valuenow', t)

    this.updateCard(entry, current, t)
  },

  updateCard(entry, range, t){
    if(!this.root) return
    /* The card names the DAY: an authored place if the plan gives one, else
       the day trip, else the stay itself. */
    const loc = TRIP.byId[entry.spurId ?? range.locationId]
    const title = entry.place || loc?.name?.en || ''
    const start = this.itinerary.dateRange?.start
      ? new Date(this.itinerary.dateRange.start + 'T00:00:00') : null
    const date = start ? new Date(start.getTime() + t * 86400000) : null
    /* fr-FR month names (fevrier, decembre...) carry an accented e — the
       hand font this renders in (Scribble Note) doesn't have that glyph,
       so it comes back out on trips that use it. See handFontHasNoAccents(). */
    const fmt = d => {
      const s = new Intl.DateTimeFormat('fr-FR', { day:'numeric', month:'long' }).format(d)
      return handFontHasNoAccents() ? stripEAccents(s) : s
    }

    const city  = this.root.querySelector('.tl-city')
    const dateP = this.root.querySelector('.tl-date')
    if(city)  city.textContent = title
    if(dateP) dateP.textContent = date ? `${fmt(date)} · Jour ${t + 1}` : `Jour ${t + 1}`
  },
}
