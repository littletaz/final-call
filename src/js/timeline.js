import { TRIP, tripAsset, stopDates, handFontHasNoAccents, stripEAccents } from './data.js'

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
  svg: null, route1: null, route2: null, route1Base: null, route2Base: null,
  len1: 0, len2: 0,
  poiLengths: [],
  ranges: [],
  maxDay: 0,
  boundaryFrac: 0,   /* where leg 1 ends and leg 2 begins on the mini-track, 0-1 */
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
    await this.buildRoute()
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

  async buildRoute(){
    const cfg = TRIP.data.map.route
    const host = document.getElementById('pois')
    if(!cfg || !host) return

    /* Trip-owned art for the link icon — set as a CSS custom property
       (same pattern as --sel-panel-img in main.js/main.css) so timeline.css
       stays trip-agnostic. Only done when this trip actually has a route
       (i.e. the timeline will show), so a trip without one never 404s. */
    const abs = file => new URL(tripAsset(file), document.baseURI).href
    document.documentElement.style.setProperty(
      '--tl-link-icon', `url('${abs('img/timeline/link-icon.svg')}')`)

    if(!this.cache){
      try{
        const res = await fetch(tripAsset(cfg.src))
        if(!res.ok) throw new Error(`HTTP ${res.status}`)
        this.cache = new DOMParser().parseFromString(await res.text(), 'image/svg+xml')
      }catch(e){
        console.warn(`[final-call] missing asset: ${cfg.src} — timeline route disabled`)
        return
      }
    }
    const src = this.cache
    const d1 = src.getElementById('route-1')?.getAttribute('d')
    const d2 = src.getElementById('route-2')?.getAttribute('d')
    if(!d1 || !d2) return

    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', src.documentElement.getAttribute('viewBox'))
    svg.setAttribute('preserveAspectRatio', 'none')
    svg.classList.add('route-layer')
    svg.style.left   = (cfg.x * 100) + '%'
    svg.style.top    = (cfg.y * 100) + '%'
    svg.style.width  = (cfg.w * 100) + '%'
    svg.style.height = (cfg.h * 100) + '%'

    /* The travelled copy is a pixel wider than the black one it covers, so
       the leg visibly thickens as well as colours as you pass it — and the
       black never peeks out from under it along the curve. */
    const mk = (id, d, color, width) => {
      const p = document.createElementNS(NS, 'path')
      p.setAttribute('d', d)
      p.setAttribute('id', id)
      p.setAttribute('stroke', color)
      p.setAttribute('stroke-width', width)
      p.setAttribute('fill', 'none')
      return p
    }
    /* The route is ALWAYS fully drawn, in black, so it never looks "lost" —
       a second copy on top reveals via dasharray as you scrub past it, so
       the travelled portion colours itself in by transport. */
    const leg1 = readLeg(cfg.legs?.['route-1'])
    const leg2 = readLeg(cfg.legs?.['route-2'])
    this.route1Base = mk('route-1-base', d1, ROUTE_BLACK, ROUTE_W)
    this.route2Base = mk('route-2-base', d2, ROUTE_BLACK, ROUTE_W)
    this.route1 = mk('route-1', d1, legColor(leg1), ROUTE_W_ACTIVE)
    this.route2 = mk('route-2', d2, legColor(leg2), ROUTE_W_ACTIVE)

    /* the card's mini-track mirrors the map's two-tone split, so it reads
       its colours from the same place rather than repeating them */
    this.track?.style.setProperty('--leg-1', legColor(leg1))
    this.track?.style.setProperty('--leg-2', legColor(leg2))
    this.mapMarker = document.createElementNS(NS, 'circle')
    this.mapMarker.setAttribute('r', '9')
    this.mapMarker.setAttribute('fill', '#fff')
    this.mapMarker.setAttribute('stroke', '#1C2321')
    this.mapMarker.setAttribute('stroke-width', '2.5')
    this.mapMarker.classList.add('route-marker')

    svg.append(this.route1Base, this.route2Base, this.route1, this.route2, this.mapMarker)
    host.appendChild(svg)
    this.svg = svg

    this.len1 = this.route1.getTotalLength()
    this.len2 = this.route2.getTotalLength()
    /* The dash pattern is each leg's whole length and never changes — only
       the OFFSET moves, and moving it is what reveals the route. Set once
       here rather than on every scrub, so the tween has nothing to fight. */
    this.route1.setAttribute('stroke-dasharray', this.len1)
    this.route2.setAttribute('stroke-dasharray', this.len2)

    /* ---- transport badges ----
       Figma pins a 22px black disc with a white glyph at the middle of the
       flight arc (node 169:1655), which is the leg's "how you get there"
       told in one mark. Which legs get one, and which glyph, is data —
       map.route.legs maps a path id in route.svg to a file in
       img/transport/ (plane, car, bus, train) — so a trip that drives its
       second leg just says so rather than needing code.

       Drawn in the route's own user units: route.svg is stretched with
       preserveAspectRatio="none", but its box and viewBox agree to within
       half a percent, so a circle stays a circle. */
    this.badges = []
    for(const [pathId, raw] of Object.entries(cfg.legs ?? {})){
      const leg = readLeg(raw)
      if(!leg.badge) continue
      const isSecond = pathId === 'route-2'
      const path = isSecond ? this.route2 : pathId === 'route-1' ? this.route1 : null
      if(!path) continue

      const half = path.getTotalLength() / 2
      const mid = path.getPointAtLength(half)
      const g = document.createElementNS(NS, 'g')
      g.classList.add('route-badge')
      const disc = document.createElementNS(NS, 'circle')
      disc.setAttribute('cx', mid.x); disc.setAttribute('cy', mid.y)
      disc.setAttribute('r', '11.2')          /* 22px across on the 1440 canvas */
      disc.setAttribute('fill', ROUTE_BLACK)
      g.appendChild(disc)

      /* The glyph is INLINED rather than referenced as an <image>, because
         it has to recolour: an external image can't be restyled from here,
         and the icon turns its leg's colour once you've travelled past it.
         Its own fills become currentColor so one property drives it. */
      const glyph = await this.loadGlyph(leg.mode)
      if(glyph){
        glyph.setAttribute('transform',
          `translate(${mid.x - 6} ${mid.y - 6}) scale(${12 / glyph.dataset.span})`)
        g.appendChild(glyph)
      }
      svg.appendChild(g)
      /* where this badge sits along the COMBINED path, so drawRoute() can
         tell when the reveal has reached it */
      this.badges.push({ el: g, disc, at: (isSecond ? this.len1 : 0) + half, color: legColor(leg) })
    }

    /* The container (which also holds #length-tabs) is shown as soon as the
       trip has route art at all. Per-itinerary route/POI mismatches below
       only hide the CARD (see setItinerary()) — the length switcher must
       stay reachable so a trip stuck on a mismatched variant can still
       switch back to one that works. */
    this.root?.removeAttribute('hidden')

    /* Map each POI rect (in the order Figma authored them — start to end
       of the journey) to how far along the combined path it sits, by
       finding the closest sampled point. 200 samples is plenty for a
       couple of smooth bezier curves. */
    const rects = [...src.querySelectorAll('rect[id^="POI"]')]
    this.poiLengths = rects.map(r => {
      const cx = Number(r.getAttribute('x')) + Number(r.getAttribute('width')) / 2
      const cy = Number(r.getAttribute('y')) + Number(r.getAttribute('height')) / 2
      return this.nearestLength(cx, cy)
    })
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

  nearestLength(x, y){
    const total = this.len1 + this.len2
    let best = 0, bestDist = Infinity
    const STEPS = 200
    for(let i = 0; i <= STEPS; i++){
      const len = total * i / STEPS
      const p = len <= this.len1
        ? this.route1.getPointAtLength(len)
        : this.route2.getPointAtLength(len - this.len1)
      const dist = (p.x - x) ** 2 + (p.y - y) ** 2
      if(dist < bestDist){ bestDist = dist; best = len }
    }
    return best
  },

  pointAt(len){
    return len <= this.len1
      ? this.route1.getPointAtLength(len)
      : this.route2.getPointAtLength(Math.min(len - this.len1, this.len2))
  },

  /* Rebuilds day ranges, the mini-track's dots, and the quick-jump tabs
     for the active itinerary — base stops only, day offsets from
     stopDates() so this can never drift from the dates shown elsewhere. */
  setItinerary(itinerary){
    const bases = itinerary.stops.filter(s => !s.spur)
    if(!this.svg || bases.length !== this.poiLengths?.length){
      /* route.svg's POI count doesn't match this itinerary's base-stop
         count — the two are only guaranteed to line up for the itinerary
         the route was drawn against. Hide the CARD rather than show
         something wrong — not the whole container, so #length-tabs (a
         sibling inside it) stays usable to switch to a variant that
         does line up. */
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
    this.boundaryFrac = this.ranges.length > 1 ? this.ranges[1].start / this.maxDay : 1
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
    if(!this.route1 || !this.route2) return
    this.route1.setAttribute('stroke-dashoffset', this.len1 - Math.min(len, this.len1))
    this.route2.setAttribute('stroke-dashoffset', this.len2 - Math.max(0, len - this.len1))
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
    if(!this.route1 || !this.route2) return
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

    /* the mini track's own fill/marker — two-tone, same split as the map route */
    const dayFrac = this.maxDay > 0 ? t / this.maxDay : 0
    if(this.fillY){
      const yellowFrac = Math.min(dayFrac, this.boundaryFrac)
      const greenFrac = Math.max(0, dayFrac - this.boundaryFrac)
      this.fillY.style.width = `${yellowFrac * 100}%`
      this.track.style.setProperty('--green-left', `${this.boundaryFrac * 100}%`)
      this.track.style.setProperty('--green-width', `${greenFrac * 100}%`)
    }
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
