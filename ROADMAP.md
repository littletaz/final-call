# Roadmap

Where things stand and what's left. Updated as we go.

---

## Blocked on you

**Photos are 2× larger than needed.** All 46 are 1499×1000, but the scatter
layouts render them 365–595px wide on a 1920 screen — about 32% of their pixel
size, roughly 2× what a retina display needs and 4× a standard one.

| | total |
|---|---|
| now, 1000px tall | 13.6 MB |
| at 700px tall | ~6.7 MB — still retina-sharp at this size |
| at 500px tall | ~3.4 MB — fine on a standard display |

Resizing is the cheap win; better compression isn't. The alternative is keeping
1000px and serving a smaller variant with `srcset`, which lets the browser pick
per device — more machinery, worth it only if the page goes somewhere public.

Also: **Nachi has one photo and Osaka two.** They'll look thin against places
with five.

**Kayak multi-city is unverified.** The button builds one search across all
four legs. I can't open it from here. If it collapses to a round trip, the
fallback is per-leg links — `cta.flightSearch.showLegs` already exists, though
they do give the route away before the cards.

**Nine stays aren't real properties.** Marked `isArea: true`, so their links
search the area honestly rather than a hotel that doesn't exist. Replace the
name and drop the flag as you find real ones.

---

## Decisions pending

**Map sizing.** Two parts, and the first unblocks the second:

1. `cropBottom` is still `0.15`, but the dataviz left the hero — the reserved
   space at the base is now pointless. Setting it to 0 is free.
2. Then the real question: is 3840×3840 still right, how much margin does the
   artwork need, and how tall should the hero be now that nothing sits in it?

Worth doing **before** replacing the cloud and wave positions, or they'll need
placing twice.

**Footer branding.** Undefined.

**The landing page.** Currently an empty placeholder at the site root. The idea
is a departures board — one row per trip, with the status column doing real
work: `BOARDING` for the live one, `ON TIME` for planned, `CLOSED` for past,
`???` for the undefined future.

Two things to settle first: rows need real columns (month, destination, status),
which means a per-row layout with fixed column widths rather than one centred
line. And the `???` rows are the best part but must read as deliberate — so a
fixed number of them regardless of how many trips exist.

---

## Half-finished

**Waves are parked.** Seven coordinates sit in `map._wavesParked`, rendering
nothing. They were scattered by eye against the old 2556-tall canvas and no
longer line up. They need placing against the real artwork, which means adding
wave support to the CALIBRATE panel first.

**Cloud `y` positions are also from the old canvas.** They look plausible
because clouds are ambient and now positioned against the viewport, but they
were never placed against the square map.

---

## Not started

- **Sticky duration dropdown** — deferred. I'd still argue against it until you
  miss it; the cards already tell you which itinerary you're in.
- **`?itinerary=<id>`** — a shared link always opens the default duration. A few
  lines if you want to send someone straight to the 12-day version.
- **A second trip.** The schema, validator and folder structure are ready, but
  the flow is unproven until you run it once.

---

## Worth knowing

- `PLACES` reads 9 against the original mockup's 8, because Naoshima and
  Shimanami became separate locations. Never resolved.
- `thingsToDo` is priced and summed into the budget but no longer displayed.
- `intro` on each location is written and unrendered — kept for the landing page.
- **Photos: 46 across 13 locations**, converted from 114 MB of PNG to 13.6 MB
  of JPEG. The originals aren't in the repo.
