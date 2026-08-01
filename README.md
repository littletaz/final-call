# Final Call

Illustrated, data-driven trip pages. An illustrated map with clickable stops, an
itinerary switcher, and a stack of city cards — all rendered from one JSON file
per trip.

Vite + vanilla JS, no framework. Vite is here for the dev server, hot reload and
the production build — the code underneath is plain ES modules.

---

## Getting started

```bash
npm install
npm run dev        # hot-reload dev server, opens automatically
npm run build      # production build → dist/
npm run preview    # serve the built dist/ locally
npm run validate   # check every trip file against the schema
```

Node 18+ (developed on 22).

---

## Structure

```
final-call/
├── index.html                 all the markup — no copy, no content
├── vite.config.js             base: './' so builds work in any subfolder
├── TRIP_SCHEMA.md             authoring contract — paste into a new chat
├── scripts/validate-trip.mjs  schema validator (npm run validate)
├── public/                    copied verbatim into the build
│   ├── trips/                 index.json + ONE FILE PER TRIP
│   └── assets/                fonts · map · cloud · wave · poi · logo
└── src/
    ├── main.js                entry: imports CSS, boots the app
    ├── styles/
    │   ├── tokens.css         grid · colour · type · motion — art direction HERE
    │   └── main.css           layout and components
    └── js/
        ├── paths.js           base-aware path helper
        ├── data.js            loads a trip file, derives stats/nights/budgets
        ├── map.js             base map, inset, sprites, auto-numbered pins
        ├── cards.js           selector, dataviz, stacked city cards
        ├── countup.js         scroll-triggered number animation
        ├── scroll.js          easeInOutQuad scrolling (230ms)
        ├── footer.js          budget breakdown, comfort slider, CTA
        └── calibrate.js       dev only — pin placement + grid overlay
```

---

## The data model

**One file per trip.** `public/trips/<id>.json` carries everything that trip
needs — manifest, locations, itineraries, budget model, CTA. `trips/index.json`
is the registry. Load a specific trip with `?trip=<id>`.

Inside a trip file the hierarchy is **Trip → Itineraries → Locations**: locations
are declared once and referenced by id from each itinerary, so editing Kanazawa's
copy updates every itinerary that visits it.

### Authoring trips in another chat

Paste **`TRIP_SCHEMA.md`** at the *start* of a fresh planning chat — not the end.
Claude then plans with the constraints in mind and responds to three commands:

| Command | Does |
|---|---|
| `/compile-trip`  | outputs a complete new trip file |
| `/update-trip`   | takes an existing file + a change, returns the full updated file |
| `/check-trip`    | validates an attached file against the checklist |

Drop the result in `public/trips/`, add a line to `index.json`, then run
`npm run validate` before trusting it.

### Derived, not stored

`NIGHTS` and `PLACES` are computed from the stops at runtime and can't drift out
of sync with the itinerary. `RENTALS` is 0 by design (the route is deliberately
car-free). `FLIGHTS` is explicit in the data, because whether the journey home
counts is a judgement call — see `_flightsNote` on the itinerary.

### Two conventions worth knowing

**Day-trip spurs.** A stop with `nights: 0` and `spur: true` is a day trip folded
into the previous stop's nights. It still earns a pin and a card, but adds no
nights and shows a dashed `DAY TRIP` badge.

**Split stays.** A stay may carry its own `nights` to pin it to part of a stop,
for stops spanning two bases. The Japan Alps stop is 6 nights split 2 Takayama +
4 Hirayu; Naoshima's Benesse House is 1 night. Without this, per-stay prices would
multiply by the full stop length and be badly wrong.

---

## Calibration

Pin coordinates are **best guesses**, flagged `_calibrated: false` in the trip file.

1. Click **CALIBRATE** (bottom right).
2. Pick a row, then click the map to place that pin — or drag pins directly.
3. Nudge the Hong Kong inset with the arrow buttons.
4. **COPY JSON**, save it to a file, then:

   ```bash
   npm run calibrate:apply -- public/trips/<trip>.json calib.json
   # or:  pbpaste | npm run calibrate:apply -- public/trips/<trip>.json
   ```

   That writes every coordinate, updates `baseSize` from the real image, and
   sets `_calibrated: true`.
5. **Click RESET in the panel afterwards.** Calibration is held in
   `localStorage` while you work and *overrides the file on load* — so until you
   clear it you'll be looking at the saved session, not what you just committed.

Edits persist in `localStorage` while you work. **RESET** clears and reloads.
**GRID** overlays the 8-column grid for checking against Figma.

Both dev buttons are development aids — remove the two `.dev-btn` buttons, the
`#calib` aside, the `#grid-overlay` div, and the `calibrate.js` import from
`main.js` before shipping.

---

## Paths

Anything referenced by a runtime string goes through `asset()` in
`src/js/paths.js`, which prefixes `import.meta.env.BASE_URL`. That keeps the build
working whether it's served from a domain root or a subfolder. Add new sprite or
data paths the same way rather than hardcoding.

---

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. One-time setup on GitHub:

**Settings → Pages → Build and deployment → Source: GitHub Actions**

The workflow runs `npm run validate` before `npm run build`, so a malformed trip
file fails the deploy rather than shipping a broken page.

`vite.config.js` uses `base: './'`, so the build works both at a domain root and
under a project-site subpath like `user.github.io/final-call/` with no changes.

### Dev tools in production

The GRID and CALIBRATE buttons are removed from the DOM for normal visitors, and
the calibration module is a **separate chunk that is never fetched** — it isn't
in the main bundle at all.

To calibrate against the deployed site, add `?calibrate` to the URL:

```
https://user.github.io/final-call/?calibrate
```

During `npm run dev` they are always on.

---

## Known placeholders

| Item | Status |
|---|---|
| Display serif (city names) | Georgia standing in for the intended Didone |
| Body sans | System sans standing in |
| Hero images | Dashed slots; `hero` is `null` in the data |
| Card `intro` text | Still in the data but no longer rendered — kept for the future landing page |
| Hotel images | `IMG` slots |
| Pin + inset coordinates | Uncalibrated |
| Footer hero image / art direction | Structure built, styling is first-pass |
| Landing page / trip switcher | Not built yet |
| Cloud + wave positions | Hardcoded in `src/js/map.js`, not in the data |
| Cloud + wave sizes | Derived from each PNG — see below |
| Itinerary route line | Removed for now |
| Parallax | Removed; layer structure still supports adding it back |
| 17-day + 14-day variants | Structurally real, nights and budgets not costed |

## The footer budget

Five categories from `budget.categories`, rescaled live by the comfort slider
(`budget.comfortTiers`). Two of them are **derived rather than read**: `stays` is
the sum of the cheapest qualifying stay at each stop, and `activities` is the sum
of every `thingsToDo[].priceEUR`. The `baseEUR` values only apply when those
sums come out empty. Flights, transport and food use `baseEUR` as written.

Bars are scaled against the largest category rather than the total, so smaller
lines stay legible instead of collapsing to slivers.

### The Google Flights link

Google Flights has no stable public URL format for multi-city — the `tfs`
parameter is an encoded protobuf. The natural-language `q=` form is the reliable
documented entry point, so that's what gets built.

This trip is an **open jaw** (Paris → Hong Kong out, Tokyo → Paris home), which
`q=` can't express in one search. The CTA therefore links the outbound leg, with
the leg home offered as a second link in the note beneath. On itineraries without
exact dates the button disables itself and says so.

## Changing the map canvas

Pin, inset and sprite coordinates are all fractions of the map image. Change the
image's dimensions and every one of them points somewhere else. `scripts/remap-canvas.mjs`
rewrites them so they keep pointing at the same spot on the artwork:

```bash
# preview first — nothing is written
npm run remap -- public/trips/japon-2026.json --new 3840x3840 --dry

# then for real
npm run remap -- public/trips/japon-2026.json --new 3840x3840 --top 642
```

`--top` is how many pixels of new canvas sit **above** where the old artwork
begins. Omit it and the old artwork is assumed centred. It also updates
`baseSize` and prints replacement y values for the clouds and waves in
`src/js/map.js`, which live in code rather than data.

This only works if the artwork was **padded**. If you moved things around while
re-exporting, use the CALIBRATE panel for pins and adjust the sky by eye.

## Trimming the map's empty base

`map.cropBottom` in the trip file hides a fraction of the image from the bottom
and shortens the hero to match — a way to reduce dead space without touching the
artwork. Pin and sprite coordinates remain fractions of the full image and are
rescaled on render, so a calibration survives a crop change.

The dataviz sits `--stats-bottom` above the base of the (cropped) frame. That's a
clamped px value rather than a percentage, so it doesn't drift as the frame's
height changes with the window.

## Sprite sizing

Cloud and wave widths are **not** hand-tuned. Each sprite renders at its exported
width **as a fraction of the map image**. Both come out of the same canvas, so a
cloud drawn 787px wide beside a 3840px map occupies 787/3840 of it — correct at
any display size, and self-correcting if the map is ever re-exported at a
different resolution.

To resize one, **re-export the PNG at the size you want** — no code change. To
nudge the whole sky at once, change `SPRITE_SCALE` at the top of `src/js/map.js`
(1 = exactly as exported). For a single sprite, add `scale` to its entry
(`scale: 1.4` = 40% larger than exported).

Only position and motion live in code: `x`/`y` as percentages of the map,
`dur` seconds per loop, `travel` how far a cloud drifts before wrapping.
`x + travel` must exceed 100 or the loop reset becomes visible.

## Notes

- **`PLACES` reads 9, not the 8 in the mockup.** Naoshima and Shimanami Kaido
  became separate locations, so there are now 9 pins, 9 cards and 9 places —
  internally consistent, but one more than the mockup drawn before the split.
  Fix by merging them back into one location, or by excluding `spur` stops from
  the count in `data.js`.
- **Pins are generated, not drawn.** One `assets/poi/pin.svg` carries the shape;
  the number is DOM text driven by the stop's position in the *active* itinerary,
  so it renumbers automatically when you reorder stops or switch variant.
- **Waves currently bob 12–19px** with a slight sideways drift. If that still
  reads as too subtle, a real frame sequence would be the next step — the current
  `wave-0001…0007` files look like seven separate shapes rather than seven frames
  of one motion, so a spritesheet would need a fresh export.
- **Osaka Moji carries no CJK glyphs**, so kanji fall back to a system Japanese
  face and will differ between machines. A subset CJK font would fix it.
- The **map is capped at 1920px** (the Figma artboard). Wider viewports just show
  more sea — invisible, since the body background matches the map's water.
