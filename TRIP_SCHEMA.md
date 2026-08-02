# Trip file — authoring contract

One trip = one JSON file in `public/trips/`, plus one line in `public/trips/index.json`.

---

## How to use this

**Paste this whole file at the START of a new chat, before you plan anything.**

That's the important part. If you paste it at the end, Claude has to reverse-engineer
a finished itinerary into a schema it's seeing for the first time — which is where
mistakes come from. Pasted first, it plans with the constraints in mind and can
compile on demand.

Open the chat with:

> I'm planning a trip and I'll want it as a data file for my site at the end.
> Here's the contract that file has to satisfy — read it now, keep it in mind while
> we plan, and don't output any JSON until I run one of the commands at the bottom.
>
> [paste this file]
>
> Now: let's plan [destination], [dates], [who's going], [what we're into].

Then plan normally. When you're happy, run `/compile-trip`.

### Editing a trip that already exists

Different opening — you're not planning from scratch, you're amending a file. Attach
the existing trip file alongside the doc:

> I have an existing trip file for my site and I want to change it. Here's the
> contract it has to satisfy, and the current file attached.
>
> [paste this file]
>
> [attach `<trip-id>.json`]
>
> Read both. Don't output anything yet — I want to work out the change with you first.

Discuss the change, then run `/update-trip`. You'll get the whole file back.

Two things worth saying out loud in that chat:

- **"Only use locations already in the file"** — if the new itinerary should reuse
  existing places. Otherwise a new place needs a full location entry: 3+ stays,
  priced activities, coordinates.
- **"Keep the existing coordinates"** — if you've already calibrated pins. They're
  hand-placed and shouldn't be regenerated.

### After either command

Save the file into `public/trips/`, make sure it's listed in `index.json`, then:

```bash
npm run validate
```

Do this every time. A chat with no memory of the project can quietly get `days`
wrong or give a location two hotels instead of three. The validator is what actually
enforces this contract — the document only improves the odds.

---

## Commands

Claude: treat the three lines below as commands. When the user sends one, do exactly
what it says and nothing else — no preamble, no summary, no commentary after.

### `/compile-trip`

Output **one complete JSON file** for a brand-new trip, following the schema below.

Before outputting, silently verify every item in the checklist at the end. If
something can't be satisfied — a location with fewer than three hotels, say — fix it
by researching more options rather than emitting an invalid file. If a fact is
genuinely unknown (an exact price, a coordinate), use a sensible estimate and list
those estimates in a short note **after** the JSON so they can be checked.

Filename: `<trip-id>.json`. Also output the one-line entry for `index.json`.

### `/update-trip`

The user will attach an **existing** trip file and describe a change. Output the
**complete updated file**, not a diff — it's less error-prone to replace the whole
thing than to hand-patch JSON.

Preserve everything not mentioned: calibrated coordinates, existing copy, prices.
Never regenerate content that already exists. After the JSON, list what changed in
three lines or fewer.

Watch for knock-on effects — these are the ones that bite:

| The change | What else must move |
|---|---|
| Adding or removing a stop | `days` must stay `nights + 1` |
| Changing nights at a stop | Same — recheck `days`, and `dateRange.end` |
| Shifting dates | `dateRange`, and `periodDisplay` |
| Adding an itinerary | Nothing else, unless it visits a new place — then add the location too |
| Adding a location | Needs 3+ stays, activities with prices, and coordinates |
| Removing a location | Only safe if no itinerary still references it |

### `/check-trip`

The user attaches a trip file. Run the checklist at the end of this document against
it and report pass/fail per item. Don't output a corrected file unless asked.

---

## File shape

One folder per trip under `public/trips/<trip-id>/`, holding `trip.json` and
every asset it uses. Paths inside the file are **relative to that folder**, so
two trips can both ship a `pin.svg` without colliding.

```
public/trips/japon-2026/
  trip.json
  map.png  map-hk.png  logo.png  pin.svg
  img/        photos for the city cards
  clouds/     drifting sprites
  waves/      placed sprites (optional)
  fonts/      if the trip self-hosts one
```

```jsonc
{
  "id": "japon-2026",              // must match the folder name
  "title": "Japon & Hong Kong",
  "subtitle": "…",
  "defaultItineraryId": "full-21",

  "artDirection": {
    "id": "sumi-e-ink-wash",
    "colors": { "sea": "#596D88", "paper": "#FAEDDC", "seal": "#CF4736", "ink": "#1E222B" },
    "fonts": { "display": {…}, "sans": {…} }      // see Fonts
  },

  "map": {
    "base": "map.png",
    "baseSize": { "w": 3840, "h": 3840 },         // must match the real file
    "backgroundColor": "#596D88",                 // must match the artwork's edge
    "cropBottom": 0.15,                           // optional, 0–1
    "pin": "pin.svg",
    "logo": "logo.png",
    "inset": { "id": "hongkong", "src": "map-hk.png", "x": 0.1, "y": 0.2125, "w": 0.18 },
    "clouds": [ { "file": "clouds/01.png", "x": -18, "y": 25.5, "dur": 118, "travel": 140 } ],
    "waves":  [ { "file": "waves/01.png",  "x": 0.13, "y": 0.66, "dur": 6.5, "dy": 18 } ],
    "waveDivisor": 2,
    "_calibrated": true
  },

  "locations":   [ … ],
  "itineraries": [ … ],
  "budget":      { … },
  "cta":         { … }
}
```

### Sprites

**Clouds** drift across the whole viewport, so `x`, `y` and `travel` are
percentages of the **screen**. `x + travel` must exceed 100 or the loop reset
happens on screen — the validator checks this.

**Waves** are placed features of the map, like pins: `x` and `y` are fractions
of the map image, in the same space as pin coordinates. A map with no water
simply omits the array. They render at their exported width over `waveDivisor`
(assets are 2× exports, so 2 renders them 1:1).


### Fonts

Each trip declares its own faces and **only those are downloaded** — ten trips
with ten pairings still cost one visitor two font files. Two roles:

- **`display`** → the `--display` variable: numerals, the dataviz, the selector
- **`sans`** → the `--sans` variable: everything else

There is no serif role. A face comes from either `google` (a Google Fonts
family+axis string) or `src` (a self-hosted file under `public/`). Prefer
**woff2** for self-hosted files — about half the size of otf for the same
outlines, and support is universal.

Always give a `fallback` stack. Fonts are requested after the trip data
resolves, so text paints in the fallback first and swaps; without one it paints
in whatever the browser defaults to.

Copy `grid` verbatim from an existing trip file. Everything
under `map` is specific to the artwork.

### The canvas

**Every trip in this project uses the same canvas ratio.** That's a deliberate
convention rather than something the code enforces, and it removes a whole class
of problems: the artwork carries its own margin, so land never reaches the image
edge and there's no hard rectangle where the map meets `backgroundColor`.

Two things the artwork has to provide:

- **Margin on all four sides**, wide enough that the map reads as floating in the
  surround rather than being cropped by it.
- **Clear space at the bottom** for the dataviz, which sits *inside* the frame.
  How far up it sits is `--stats-bottom` in `tokens.css`.

### Trimming the bottom without re-exporting

If the artwork leaves more empty space at the base than a given trip needs, set
`map.cropBottom` — a fraction of the image height to hide, measured from the
bottom. `0.12` hides the lowest 12% and shortens the hero to match.

Coordinates stay fractions of the **full** image, so cropping never invalidates a
calibration; pins, clouds and the inset are rescaled at render time. Changing the
crop later doesn't require recalibrating.

The validator refuses a crop that would hide a pin, naming the ones that sit
below the cut.

`baseSize` must match the file's real pixel dimensions — the hero's aspect ratio
is derived from it, and every pin coordinate is a fraction of it. Get it wrong
and the whole map is subtly stretched.

`backgroundColor` fills beside the frame on wide screens and is what the paper
texture multiplies against. **Sample it from the actual edge pixels of your map
file**; if it drifts, you get a visible seam.

The hero is intentionally taller than the viewport — you scroll down through the
map before reaching the dataviz and then the city cards.

Pins are always stored as fractions of the *image*, never of the screen, so
calibrated values stay correct at any window size.

---

## `locations[]`

A place, written once and referenced by any itinerary that visits it.

```jsonc
{
  "id": "kanazawa",
  "name": { "en": "Kanazawa", "jp": "金沢" },
  "kanjiChips": ["金", "沢"],                 // 1–3, shown beside the dates
  "chipCaption": "…",                         // no longer rendered; kept for later
  "subtitle": "…",
  "intro": "…",                               // for the landing page, unrendered

  "coordinates": { "x": 0.4769, "y": 0.4565 },  // fractions of the map image
  "scatter": 2,                                 // which photo layout, 0–3

  "photos": [ { "src": "img/kanazawa-01.jpg" } ],   // 1–6, see Photos

  "thingsToDo": [                              // kept in the data, NOT rendered
    { "title": "…", "note": "…", "priceEUR": [8, 12] }
  ],

  "stays": [ … ]                               // exactly 3, see Stays
}
```

### Photos

Beauty shots of the place — **1 to 6**. They fill the slots of the layout named
by `scatter` in order, so three photos use the first three positions and a
sparse place still looks arranged rather than half-finished.

Any aspect ratio; the card crops nothing. **1000px tall** is the current
convention, though that's about 2× what the layout needs — see ROADMAP.

No slot may enter the safe column (x 26–74%), which holds the dates, title and
hotel list. That's enforced in `src/js/scatter.js`, not by eye.

### Stays

**Exactly three per location.** The budget's *Where we sleep* lever picks the
cheapest, middle and dearest at each stop — so three is what makes the three
options work, and it's why the dearest can never cost less than the middle.

```jsonc
{
  "tier": "budget",                    // label only; the ordering is by price
  "name": "Hotel Trusty Kanazawa",
  "priceNightEUR": [95, 135],
  "nights": 2,                         // optional, for a split stay
  "base": "Takayama",                  // which town, on a split stay
  "bookingUrl": "https://www.booking.com/searchresults.html?ss=…",

  "isArea": true,                      // NOT a real property — see below
  "area": "Wakura Onsen",
  "kind": "ryokan"
}
```

`isArea` marks a **kind of place in an area** rather than a named hotel. Its
link searches the area instead of a property that doesn't exist, which is
honest and lands somewhere useful. Replace the name with a real hotel and drop
the flag when you find one.


## `itineraries[]`

Variants of the same trip — different durations or emphases over the same locations.
The day-selector switches between these.

```jsonc
{
  "id": "full-21",
  "days": 21,
  "label": "Alps & Inland Sea",           // internal name, not shown in the UI
  "dateRange": { "start": "2026-10-24", "end": "2026-11-13" },   // or nulls
  "periodLabel": "mid Sep – early Oct",   // used only when dateRange is null
  "periodDisplay": "24 Oct – 13 Nov",     // what the selector actually shows
  "flights": 3,

  "stops": [
    { "locationId": "hongkong",  "nights": 3, "arriveBy": "flight" },
    { "locationId": "kanazawa",  "nights": 3, "arriveBy": "surface" },
    { "locationId": "noto",      "nights": 0, "arriveBy": "surface",
      "spur": true, "spurFrom": "kanazawa" }
  ]
}
```

`arriveBy` is `flight` or `surface` (train, bus, ferry, bike).

**Day-trip spurs.** `nights: 0` + `spur: true` is a day trip folded into the previous
stop's nights. It still gets a pin and a card, and shows a dashed `DAY TRIP` badge
instead of a night count. A spur **must** have `nights: 0`.

### The arithmetic rule

For every itinerary: **`sum(stops[].nights) === days - 1`**.

Arriving 24 Oct and leaving 13 Nov is 20 nights and 21 days. And if `dateRange` is
set, the span between `start` and `end` must equal that same night count. This is the
single easiest thing to get wrong — check it before finishing.

`NIGHTS` and `PLACES` in the dataviz are computed from `stops` at runtime, so they
can't be set directly and can't drift. `RENTALS` is always 0 (these routes are
car-free by design). `FLIGHTS` comes from the field above, because whether the
journey home counts is a judgement call — say which you chose in a `_flightsNote`.

---

## `budget`

Three levers, each a real choice about this trip. A total is shown on arrival
with the defaults — the controls are for *"but what if we…"*, never a form to
fill in first.

```jsonc
"budget": {
  "currency": "EUR",
  "levers": {
    "sleep": {
      "label": "Where we sleep",
      "options": [                         // ids are fixed: the renderer maps them
        { "id": "cheap",  "label": "business hotels" },
        { "id": "middle", "label": "one ryokan night" },
        { "id": "dear",   "label": "ryokan where there is one" }
      ],
      "default": "cheap"
    },
    "eat": {
      "label": "How we eat",
      "perNight": true,                    // the figures below are per night
      "options": [
        { "id": "konbini", "label": "konbini and ramen",            "eur": [18, 26] },
        { "id": "mixed",   "label": "mostly casual, a few dinners",  "eur": [35, 50] },
        { "id": "proper",  "label": "eating properly",               "eur": [70, 105] }
      ],
      "default": "mixed"
    },
    "move": {
      "label": "Getting around",
      "options": [ { "id": "local", "label": "local trains", "eur": [300, 380] }, … ],
      "default": "mixed"
    }
  },
  "fixed": [ { "id": "flights", "label": "Flights", "eur": [900, 1100] } ],
  "presets": [
    { "id": "comfort", "label": "Comfortable", "sleep": "cheap", "eat": "mixed", "move": "mixed" }
  ]
}
```

**`sleep` carries no prices.** It picks the cheapest, middle or dearest stay
*at each stop* and sums the real hotels — so the accommodation line is
arithmetic on choices already made, not a model. That's also why it can't
invert: dearest is dearest by construction.

**`eat` and `move` are per-trip**, because a konbini breakfast in Japan is not
a konbini breakfast in Portugal. Six numbers to author.

**Activities aren't a lever** — every `priceEUR` in `thingsToDo` is summed and
shown as a fixed line. They swing a few hundred against a few thousand.

## `cta`

```jsonc
"cta": {
  "headline": "So… are you in?",
  "flightSearch": {
    "provider": "kayak",                  // kayak | momondo | google
    "passengers": 2,
    "cabin": "economy",
    "showLegs": false,                    // per-leg links give the route away
    "legs": [
      { "from": "PAR", "to": "HKG", "dateFrom": "itineraryStart" },
      { "from": "HKG", "to": "NGO", "date": "2026-11-01" },
      { "from": "TYO", "to": "PAR", "dateFrom": "itineraryEnd" }
    ]
  }
}
```

`dateFrom` references the itinerary rather than hardcoding a date, so the link
follows whichever duration is selected.


## Fields the renderer ignores

Kept in the data because they cost nothing and may be wanted later. Nothing
breaks if they're absent.

| field | where | note |
|---|---|---|
| `schemaVersion` | root | for a future migration |
| `budgetPerPersonEUR` | `itineraries[]` | superseded by the `budget` model |
| `epithet`, `tags` | `locations[]` | from the earlier card design |
| `chipCaption` | `locations[]` | replaced by the dates on the card |
| `foodNotes` | `locations[]` | may feed a per-place food model |
| `intro` | `locations[]` | written for the landing page |
| `thingsToDo[]` | `locations[]` | priced and summed, but not displayed |
| `assetId` | `locations[]` | an authoring cross-reference |
| `grid` | root | `columns`, `gutter`, `artboard` etc. — copy verbatim |
| `cta.buttonLabel` | `cta` | the buttons say YES / NO now |

## Registering the trip

Add it to `public/trips/index.json`:

```jsonc
{
  "defaultTripId": "japon-2026",
  "trips": [
    { "id": "japon-2026", "title": "Japon & Hong Kong",
      "file": "trips/japon-2026.json",
      "period": "24 Oct – 13 Nov 2026",
      "cover": "assets/map/map-japon.png" }
  ]
}
```

Load a specific trip with `?trip=<id>`. Without it, `defaultTripId` wins. **A file
not listed here is invisible to the app** — the validator warns about this.

---

## Validation checklist

Run `npm run validate` after dropping a file in. It checks all of this and exits
non-zero on failure, so it can go in a pre-commit hook.

- [ ] Valid JSON — no trailing commas, no comments
- [ ] Filename matches `id`
- [ ] Every `stops[].locationId` exists in `locations[]`
- [ ] Every location has **3 or more** `stays`
- [ ] Every stay has a valid `tier` and `priceNightEUR: [lo, hi]` with `lo <= hi`
- [ ] Every stay has an absolute `https://` `bookingUrl`
- [ ] `thingsToDo` entries are objects with a `title`, not plain strings
- [ ] All `coordinates` are between 0 and 1
- [ ] Any `coordinates.onInset` matches `map.inset.id` exactly
- [ ] `map.inset.forLocationId` is a real location
- [ ] For each itinerary, `sum(stops[].nights) === days - 1`
- [ ] Where `dateRange` is set, its span equals that night count
- [ ] Every spur has `nights: 0`
- [ ] `defaultItineraryId` matches an existing itinerary
- [ ] `cta.flightSearch.provider` is `kayak`, `momondo`, or `google`
- [ ] Every leg has 3-letter `from` / `to` codes and a valid `dateFrom`
- [ ] Referenced map assets exist in `public/assets/`
- [ ] `map.baseSize` matches the image's real pixel dimensions
- [ ] `map.backgroundColor` matches the artwork's edge colour
- [ ] The artwork has margin on all sides and clear space at the bottom
- [ ] Each `artDirection.fonts` entry has a `family`, a `google` or `src`, and a `fallback`
- [ ] The trip is listed in `index.json`

A new map also needs its artwork in `public/assets/map/` and a correct `baseSize`.
