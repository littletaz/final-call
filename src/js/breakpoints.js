/* ============================================================
   BREAKPOINTS
   One ladder, shared by JS and by the @media queries in src/styles/*.

   The widths come from the Figma "Mediaqueries" section (node 169:2327),
   which authors the whole page at 2156 / 1440 / 1200 / 768 / 375. Read
   together those five frames describe two FIXED canvases, each centred,
   with only the map and the section backgrounds bleeding full width:

     >= 1800    the wide desktop treatment: the map band is 1477 tall and
                the next section starts at page y 1600, as the 2156 and
                3820 frames draw it. Every element is still the 1440
                layout centred (at 2156, shifted +358 = (2156-1440)/2).
     1024-1799  ONE band. The 1440 frame and the 1200 frame agree on the
                map: window 1120 tall, next section at page y 1408 — the
                1440 one is NOT a small 2156, it is a wide 1200. Above
                1440 the canvas is fully visible, below it is clipped at
                the sides (at 1200 everything is the 1440 layout shifted
                -120px), but nothing steps at 1440 itself.
     <= 1023    the mobile canvas — Figma's 375 design, centred. The 768
                frame is that same content centred in 768; section heights
                are identical between the two. The one exception is the
                hero wordmark, which has its own size at 768 (hero.css).

   1024 is the desktop/mobile line. Figma has no frame between 768 and
   1200, so it sits between them on the conventional tablet-landscape
   boundary. It replaces the old 860px guess, which had no mockup behind
   it and left 861-1199 running a badly clipped desktop layout.

   1800 is the line between the two desktop treatments. Figma has no frame
   between 1440 and 2156 either, so it too is a choice rather than a
   measurement — see src/styles/timeline.css, which already used it.
   ============================================================ */
export const NARROW_MQ = '(max-width: 1023px)'

export const isNarrow = () => window.matchMedia(NARROW_MQ).matches

/* The wide-screen query (Figma node 173:2633, the frame named "3200px").
   Past it the map stops being a full-bleed band and becomes what the
   artwork always was in the newer mockups: a fixed 1908x1120 window with
   soft edges, floating on the paper with room around it. Content stays in
   the same centred 1440 column; the ledger is the only other thing that
   grows (794 -> 1184). */
export const WIDE_MQ = '(min-width: 3200px)'

export const isWide = () => window.matchMedia(WIDE_MQ).matches

/* The two mobile frames Figma actually draws. The map artwork is 1:1 at
   768 and map.narrowScale at 375; MapView interpolates between them so a
   viewport in the gap is still on the line the mockups define. */
export const MAP_FULL_WIDTH   = 768
export const MAP_NARROW_WIDTH = 375
