/* ============================================================
   SCATTER
   Photo arrangements for the city cards.

   Positions live here as reusable LAYOUTS rather than in the trip
   data: authoring x/y/rotation for 13 cities x 6 photos would be
   ~78 hand-tuned entries, and most of them would be arbitrary.
   A location picks a layout (or gets one from its index) and its
   photos fill the slots in order. Three photos use the first three
   slots, six use all of them — so a sparse city still looks
   deliberate rather than half-finished.

   Slots are percentages of the card, so they scale with it.
   `d` is parallax depth — pixels of vertical travel per unit of
   scroll progress; bigger reads as nearer. Movement is vertical
   only: lateral drift carried prints into the text.

   No slot may straddle x 26-74%. That column holds the dates, the
   title and the hotel list, and a photograph behind any of them
   made it unreadable. Keeping the slots out of it is structural —
   there's nothing to check by eye.
   ============================================================ */

export const LAYOUTS = [
  /* A — weight right, one cutting the left edge */
  [
    { x:   76, y:  -18, w:  26, r:   12, d:  120 },
    { x:   78, y:   20, w:  30, r:   -6, d:   68 },
    { x:  -11, y:   26, w:  25, r:    3, d:  161 },
    { x:   -6, y:   70, w:  24, r:   -8, d:   94 },
    { x:   80, y:   58, w:  23, r:    5, d:   47 },
    { x:    3, y:   -6, w:  19, r:   -4, d:  182 },
  ],
  /* B — weight left */
  [
    { x:  -12, y:   12, w:  28, r:   -7, d:  132 },
    { x:   82, y:   -8, w:  24, r:    9, d:   76 },
    { x:   -4, y:   62, w:  23, r:    4, d:  152 },
    { x:   75, y:   36, w:  27, r:   -5, d:   56 },
    { x:   74, y:   76, w:  22, r:   14, d:  112 },
    { x:    4, y:   34, w:  20, r:   -9, d:   86 },
  ],
  /* C — sparser, diagonal */
  [
    { x:   79, y:   -6, w:  29, r:   -9, d:  102 },
    { x:  -10, y:   40, w:  26, r:    6, d:  148 },
    { x:    1, y:   74, w:  24, r:  -11, d:   71 },
    { x:   84, y:   46, w:  22, r:    8, d:   51 },
    { x:  -13, y:    4, w:  20, r:    5, d:  168 },
    { x:   74, y:   22, w:  21, r:   -3, d:  122 },
  ],
  /* D — corners */
  [
    { x:  -11, y:   -6, w:  25, r:    8, d:  142 },
    { x:   77, y:   -4, w:  24, r:   -7, d:  107 },
    { x:   -7, y:   60, w:  23, r:   -5, d:  163 },
    { x:   80, y:   62, w:  26, r:   10, d:   61 },
    { x:   -2, y:   30, w:  20, r:   -2, d:  127 },
    { x:   75, y:   80, w:  21, r:    6, d:   82 },
  ],
]

export function layoutFor(location, index){
  const named = location.scatter
  if(typeof named === 'number' && LAYOUTS[named]) return LAYOUTS[named]
  return LAYOUTS[index % LAYOUTS.length]
}
