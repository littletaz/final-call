import { TRIP, tripAsset } from './data.js'

/* ============================================================
   MAP EXTRAS — the "02 — Map" section furniture that isn't the map,
   pins, or the timeline: a Google Maps link built from the itinerary's
   real stops. The teaser card is owned by src/js/timeline.js now (it
   updates live as the timeline scrubs); this only sets it up once with
   the day-1 state before the timeline takes over.
   ============================================================ */

/* A real, working multi-stop directions link built from the itinerary's own
   stop order — no separate "shared map" asset to author or keep in sync. */
function googleMapsUrl(itinerary, locations){
  const byId = Object.fromEntries(locations.map(l => [l.id, l]))
  const names = itinerary.stops
    .filter(s => !s.spur)
    .map(s => byId[s.locationId]?.name?.en)
    .filter(Boolean)
  if(names.length < 2) return null
  return 'https://www.google.com/maps/dir/' + names.map(n => encodeURIComponent(n)).join('/')
}

export const MapExtras = {
  render(itinerary){
    const t = TRIP.data

    const gmaps = document.getElementById('map-gmaps')
    if(gmaps){
      const url = googleMapsUrl(itinerary, t.locations)
      if(url){ gmaps.href = url; gmaps.hidden = false }
      else gmaps.hidden = true
    }
  },

  /* icon only needs setting once — it doesn't change with the itinerary */
  initIcon(){
    const icon = document.querySelector('#map-gmaps .map-gmaps-icon')
    if(icon) icon.src = tripAsset('img/icons/gmaps-avatar.png')
  },
}
