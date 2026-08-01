import { TRIP } from './data.js'
import { MapView } from './map.js'

/* ============================================================
   DEV TOOLS
   Grid overlay + pin/inset calibration. Coordinates are held in
   localStorage while you work and exported as JSON to paste back
   into the data files. None of this is needed at runtime once the
   coordinates are committed.
   ============================================================ */
const STORE_KEY = 'japon-calib-v6'
const clamp = v => Math.max(0, Math.min(1, v))

export const Calib = {
  on: false,
  picking: null,
  coords: {},
  inset: null,
  el: {},

  init(onChange){
    this.onChange = onChange
    this.el.panel  = document.getElementById('calib')
    this.el.rows   = document.getElementById('calib-rows')
    this.el.out    = document.getElementById('calib-out')
    this.el.toggle = document.getElementById('calib-toggle')
    this.el.stage  = document.getElementById('stage')
    this.el.world  = document.getElementById('world')
    this.el.inset  = document.getElementById('inset')

    /* seed from the data files, then let any saved session win */
    for(const l of TRIP.data.locations)
      this.coords[l.id] = { x:l.coordinates.x, y:l.coordinates.y }
    this.inset = { ...TRIP.data.map.inset }
    this.restore()

    this.el.toggle.addEventListener('click', () => this.toggle())
    this.el.panel.addEventListener('click', e => this.onPanelClick(e))
    this.el.stage.addEventListener('click', e => this.onStageClick(e))

    const ov = document.getElementById('grid-overlay')
    ov.innerHTML = '<span></span>'.repeat(TRIP.data.grid.columns)
    document.getElementById('grid-toggle').addEventListener('click', e => {
      const on = ov.classList.toggle('on')
      e.target.textContent = on ? 'GRID ON' : 'GRID'
    })
  },

  /* push saved coords into the live data before the first render */
  apply(){
    for(const l of TRIP.data.locations){
      const c = this.coords[l.id]
      if(c){ l.coordinates.x = c.x; l.coordinates.y = c.y }
    }
    if(this.inset) Object.assign(TRIP.data.map.inset, this.inset)
  },

  toggle(){
    this.on = !this.on
    document.body.classList.toggle('is-calibrating', this.on)
    this.el.panel.classList.toggle('on', this.on)
    this.el.toggle.textContent = this.on ? 'DONE' : 'CALIBRATE'
    if(this.on){ this.render(); this.enableDrag() }
    else{
      this.picking = null
      document.querySelectorAll('.poi').forEach(p => p.classList.remove('is-picking'))
    }
  },

  render(){
    this.el.rows.innerHTML = TRIP.data.locations.map(l => {
      const c = this.coords[l.id]
      return `<div class="row ${this.picking === l.id ? 'sel' : ''}" data-id="${l.id}">
        <span>${l.pin} \u00B7 ${l.name.en}${l.coordinates.onInset ? ' \u29C9' : ''}</span>
        <span>${c.x.toFixed(3)}, ${c.y.toFixed(3)}</span>
      </div>`
    }).join('')

    this.el.rows.querySelectorAll('.row').forEach(r =>
      r.addEventListener('click', () => {
        this.picking = r.dataset.id
        this.highlight()
        this.render()
      }))

    this.dump()
  },

  highlight(){
    document.querySelectorAll('.poi').forEach(p =>
      p.classList.toggle('is-picking', p.dataset.locationId === this.picking))
  },

  /* which box a pin's coordinates are relative to */
  hostBox(loc){
    const ins = TRIP.data.map.inset
    return (loc.coordinates.onInset && ins && loc.coordinates.onInset === ins.id)
      ? this.el.inset : this.el.world
  },

  onStageClick(e){
    if(!this.on || !this.picking || e.target.closest('#calib')) return
    const loc = TRIP.byId[this.picking]
    const box = this.hostBox(loc).getBoundingClientRect()
    this.set(this.picking,
      (e.clientX - box.left) / box.width,
      (e.clientY - box.top)  / box.height)
  },

  set(id, x, y){
    this.coords[id] = { x:clamp(x), y:clamp(y) }
    this.save(); this.apply(); this.onChange()
    this.render(); this.highlight(); this.enableDrag()
  },

  enableDrag(){
    document.querySelectorAll('.poi').forEach(el => {
      if(el.dataset.dragBound) return
      el.dataset.dragBound = '1'
      el.addEventListener('pointerdown', ev => {
        if(!this.on) return
        ev.preventDefault(); ev.stopPropagation()
        const id  = el.dataset.locationId
        const box = this.hostBox(TRIP.byId[id])
        const move = e => {
          const r = box.getBoundingClientRect()
          const x = clamp((e.clientX - r.left) / r.width)
          const y = clamp((e.clientY - r.top)  / r.height)
          this.coords[id] = { x, y }
          el.style.left = x * 100 + '%'
          el.style.top  = y * 100 + '%'
          this.render()
        }
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          this.save(); this.apply()
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      })
    })
  },

  onPanelClick(e){
    const act = e.target.dataset.act
    if(!act) return
    const S = 0.004, i = this.inset
    if(act === 'inset-left')    i.x -= S
    if(act === 'inset-right')   i.x += S
    if(act === 'inset-up')      i.y -= S
    if(act === 'inset-down')    i.y += S
    if(act === 'inset-bigger')  i.w *= 1.04
    if(act === 'inset-smaller') i.w /= 1.04
    if(act === 'copy'){
      this.el.out.select()
      document.execCommand('copy')
      e.target.textContent = 'COPIED'
      setTimeout(() => e.target.textContent = 'COPY JSON', 1200)
      return
    }
    if(act === 'reset'){
      localStorage.removeItem(STORE_KEY)
      location.reload()
      return
    }
    this.save(); this.apply()
    MapView.placeInset()
    this.render()
  },

  /* shaped to match the data files, so it pastes straight in */
  dump(){
    this.el.out.value = JSON.stringify({
      '// paste into trip.json → map.inset': {
        x:+this.inset.x.toFixed(4), y:+this.inset.y.toFixed(4), w:+this.inset.w.toFixed(4),
      },
      '// paste each into locations.json → coordinates': TRIP.data.locations.map(l => ({
        id: l.id,
        coordinates: {
          x:+this.coords[l.id].x.toFixed(4),
          y:+this.coords[l.id].y.toFixed(4),
          ...(l.coordinates.onInset ? { onInset:l.coordinates.onInset } : {}),
        },
      })),
    }, null, 2)
  },

  save(){
    try{ localStorage.setItem(STORE_KEY, JSON.stringify({ coords:this.coords, inset:this.inset })) }catch(e){}
  },

  restore(){
    try{
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
      if(s?.coords) Object.assign(this.coords, s.coords)
      if(s?.inset)  this.inset = s.inset
    }catch(e){}
  },
}
