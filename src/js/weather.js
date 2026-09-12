import { tripAsset } from './data.js'

/* ============================================================
   MÉTÉO
   Trip-level (not per-itinerary) — two regional cards either side of a
   postcard photo. Renders once at boot, same as Highlights.
   ============================================================ */
export const Weather = {
  render(t){
    const root = document.getElementById('weather')
    const row = root?.querySelector('.wx-row')
    if(!root || !row || !t.weather?.length) return

    const cards = t.weather.map(w => `
      <div class="wx-card wx-card--${w.color || 'green'}">
        <p class="wx-region">${w.region} · ${w.dateLabel}</p>
        <p class="wx-temp">${w.tempRangeC[0]}–${w.tempRangeC[1]}°C</p>
        <ul class="wx-notes">${w.notes.map(n => `<li>${n}</li>`).join('')}</ul>
      </div>`)

    const photo = t.weather?.length
      ? `<img class="wx-photo" src="${tripAsset('img/weather/postcard.png')}" alt="">`
      : ''

    row.innerHTML = [cards[0] ?? '', photo, cards[1] ?? ''].join('')
    root.hidden = false
  },
}
