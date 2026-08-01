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

```jsonc
{
  "schemaVersion": 1,
  "id": "japon-2026",                    // kebab-case, unique, = filename
  "title": "Japon & Hong Kong",
  "subtitle": "Three weeks at peak autumn",
  "defaultItineraryId": "full-21",       // must match an itineraries[].id

  "map": {
    "assetId": "japan-ink-map-v2",
    "base": "assets/map/map-japon.png",
    "baseSize": { "w": 3840, "h": 2556 },   // the image's TRUE pixel size — pin
                                            // positions are fractions of this
    "backgroundColor": "#596D88",           // MUST match the artwork's edge colour
    "inset": {                            // OPTIONAL — a place off the main map
      "id": "hongkong-inset",
      "src": "assets/map/map-hk.png",
      "forLocationId": "hongkong",
      "y": 0.30, "w": 0.155              // `x` is ignored: the inset is pinned
                                          // to grid column 1 by CSS
    },
    "_calibrated": false                  // leave false; set true after calibrating
  },

  "artDirection": { "id": "...", "colors": {...}, "type": {...} },
  "grid": { "artboard": 1920, "columns": 8, "margin": 218, "gutter": 20,
            "columnWidth": 168, "contentWidth": 1484 },

  "budget": { /* see below */ },
  "cta":    { /* see below */ },

  "locations":   [ /* see below */ ],
  "itineraries": [ /* see below */ ]
}
```

Copy `artDirection` and `grid` verbatim from an existing trip file. Everything
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
  How far up it sits is `--stats-bottom` in `tokens.css` (default 5%).

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

Every place that appears on the map, **once**. Itineraries reference these by id, so
a place visited by three itineraries is still written once here.

```jsonc
{
  "id": "kanazawa",                       // kebab-case, unique within the file
  "pin": "03",                            // cosmetic only — pins are renumbered
                                          // per itinerary at runtime
  "name": { "en": "Kanazawa", "jp": "金沢" },   // jp may be null outside Japan
  "epithet": "THE GOLD COAST",            // short all-caps card eyebrow
  "subtitle": "Kenroku-en · Higashi Chaya · Omicho",   // separator is " · "
  "coordinates": { "x": 0.456, "y": 0.613 },
    // 0–1, fractions of the map image. GUESS THESE — they get calibrated
    // in-browser later. Add "onInset": "<inset id>" for a pin inside an inset.
  "tags": ["city", "gardens", "food"],
  "intro": "A castle town that was never bombed, so it was never rebuilt…",
    // 2–3 sentences. NOT currently rendered on the card — kept for the future
    // landing page. Still worth writing well.
  "kanjiChips": ["金", "箔"],              // exactly 2, or [] outside Japan
  "chipCaption": "Gold leaf and garden moss",
  "hero": null,                            // image path, or null for a placeholder

  "thingsToDo": [                          // objects, never plain strings
    {
      "title": "Kenroku-en Garden at opening time",
      "priceEUR": [3, 5],                  // [lo, hi] per person; [0, 0] = free
      "note": "Go before the tour groups.", // shown in the hover tooltip
      "image": null
    }
  ],

  "stays": [                               // AT LEAST 3 — the card renders 3
    { "name": "APA Hotel Kanazawa Ekimae", "tier": "budget", "priceNightEUR": [50, 80],
      "bookingUrl": "https://www.booking.com/searchresults.html?ss=APA+Hotel+Kanazawa+Ekimae%2C+Kanazawa" },
    { "name": "Smile Hotel Kanazawa",      "tier": "budget", "priceNightEUR": [50, 80],
      "bookingUrl": "https://www.booking.com/searchresults.html?ss=Smile+Hotel+Kanazawa%2C+Kanazawa" },
    { "name": "Kanazawa Machiya Inn Hana", "tier": "mid",    "priceNightEUR": [70, 110],
      "bookingUrl": "https://www.booking.com/searchresults.html?ss=Kanazawa+Machiya+Inn+Hana%2C+Kanazawa" }
  ],

  "foodNotes": "Kaiseki dinners — flag no-pork when booking."
}
```

`tier` is one of `budget` · `mid` · `splurge`.

**`bookingUrl`** makes the hotel card clickable. Prefer a **search** URL over a
deep link to a specific property page — search results survive a hotel being
renamed, relisted, or delisted, whereas a property URL rots. Include the city in
the query so the search doesn't return a same-named hotel elsewhere:

```
https://www.booking.com/searchresults.html?ss=<Hotel+Name>%2C+<City>
```

A stay without one still renders, just as a plain block instead of a link.

**Split stays.** If one stop is spent across two bases, give those stays their own
`nights` and a `base` label. Without this, prices multiply by the whole stop length
and come out badly wrong:

```jsonc
{ "name": "APA Hotel Takayama Ekimae", "tier": "budget", "priceNightEUR": [55, 85],
  "nights": 2, "base": "Takayama" },
{ "name": "Ryokan Asunaro", "tier": "mid", "priceNightEUR": [190, 210],
  "nights": 4, "base": "Hirayu Onsen" }
```

A stay without `nights` inherits the stop's full night count.

---

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

## `budget` and `cta`

```jsonc
"budget": {
  "currency": "EUR",
  "categories": [                          // per person
    { "id": "flights",    "label": "Flights",    "baseEUR": [900, 1100] },
    { "id": "stays",      "label": "Stays",      "baseEUR": [1250, 1450] },
    { "id": "transport",  "label": "Transport",  "baseEUR": [450, 550] },
    { "id": "food",       "label": "Food",       "baseEUR": [700, 850] },
    { "id": "activities", "label": "Activities", "baseEUR": [350, 450] }
  ],
  "comfortTiers": [                        // the footer slider
    { "id": "shoestring", "label": "Very poor",       "multiplier": 0.55 },
    { "id": "budget",     "label": "Budget friendly", "multiplier": 0.78 },
    { "id": "comfort",    "label": "Comfort",         "multiplier": 1.00 },
    { "id": "midhigh",    "label": "Mid-high",        "multiplier": 1.45 },
    { "id": "luxury",     "label": "Luxury",          "multiplier": 2.30 }
  ],
  "defaultTierId": "comfort"
},

"cta": {
  "headline": "So… are you in?",
  "buttonLabel": "YES",
  "flightSearch": {
    "provider": "kayak",                   // kayak | momondo | google
    "passengers": 2,
    "cabin": "economy",
    "legs": [                              // searched together as multi-city
      { "from": "PAR", "to": "HKG", "dateFrom": "itineraryStart" },
      { "from": "TYO", "to": "PAR", "dateFrom": "itineraryEnd" }
    ]
  }
}
```

`from` / `to` are 3-letter IATA city or airport codes.

`dateFrom` is `"itineraryStart"`, `"itineraryEnd"`, or an explicit `YYYY-MM-DD`.
The first two follow whichever itinerary is selected, so the link stays correct
when the visitor switches variants — prefer them over hardcoded dates.

**Provider choice matters for open jaws.** Kayak and Momondo express multi-city as
a URL path, so all legs are searched at once. Google Flights hides multi-city
inside an encoded `tfs` protobuf that changes periodically, so `google` searches
only the **first** leg and the page says so beneath the button. Use `kayak` or
`momondo` for any trip that doesn't return from where it arrived.

`stays` and `activities` are **overridden at runtime** by the sums of the actual
stays and activity prices — `baseEUR` is only a fallback for when those come out
empty. The other three use `baseEUR` as written.

---

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
- [ ] `budget.defaultTierId` is one of the `comfortTiers`
- [ ] `cta.flightSearch.provider` is `kayak`, `momondo`, or `google`
- [ ] Every leg has 3-letter `from` / `to` codes and a valid `dateFrom`
- [ ] Referenced map assets exist in `public/assets/`
- [ ] `map.baseSize` matches the image's real pixel dimensions
- [ ] `map.backgroundColor` matches the artwork's edge colour
- [ ] The artwork has margin on all sides and clear space at the bottom
- [ ] The trip is listed in `index.json`

A new map also needs its artwork in `public/assets/map/` and a correct `baseSize`.
