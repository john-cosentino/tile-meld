# Meld Masters — Copyable ChatGPT art-generation prompts

Six prompts, one per batch in
`docs/meld-masters-chatgpt-art-production-handoff.md`. Copy one batch at
a time into ChatGPT — do not run all six in one session. Every prompt
below is self-contained; you don't need to explain the project to
ChatGPT beyond what's already written in it.

**Before pasting a prompt:** attach the files it lists under
"Attachments" (find them at the paths given). ChatGPT cannot see your
repository, so every reference image and technical template it needs
must be attached by hand.

**General rule for every batch:** ask for a **review sheet first**
(a single contact-sheet image showing all requested assets at reduced
size on a neutral background), approve or request changes on that sheet,
and only then ask ChatGPT to export the individual final files. Don't
skip straight to final exports.

---

## Batch 1 — Wordmark and masthead

**Attachments:**
- `docs/design-reference/meld-masters/meld-masters-concept-01.png`
- `docs/design-reference/meld-masters/meld-masters-concept-04.png`
- `docs/design-reference/meld-masters/meld-masters-concept-logo.png`

**Prompt:**

> I'm producing UI art for a browser game called Meld Masters (an
> original retro-arcade-styled tile game — not affiliated with or based
> on any existing commercial game). I need exactly **one** asset in this
> batch: an illustrated wordmark lockup.
>
> **Asset: `wordmark-meld-masters.png`**
> - Content: the text "MELD MASTERS" as one illustrated lockup, in the
>   exact visual style of the wordmark shown in the first attached image
>   (meld-masters-concept-01.png) — a beveled, chunky arcade-logo block-
>   letter style. "MELD" in a cyan-to-white gradient family, "MASTERS" in
>   a gold-to-orange gradient family, each letter with its own highlight/
>   shadow bevel (not a flat gradient fill across the whole word), a dark
>   navy/black outer stroke on every letter, a soft drop shadow beneath
>   the whole lockup, and subtle diagonal light-streak/wing accents
>   behind or through the text, matching the second attached image
>   (meld-masters-concept-04.png) for how the same wordmark reads at a
>   smaller size.
> - Do NOT include the tagline ("STRATEGY. COMBINE. CONQUER."), any
>   round/score/season text, or a "™" symbol — this asset is the wordmark
>   only.
> - Do NOT reuse or trace the crown-and-"MM" app-icon mark in the third
>   attached image (meld-masters-concept-logo.png) — that's a different,
>   separate mark. Use it only as a palette/style cross-reference for the
>   gold crown and cream lettering tones.
> - Canvas: 2400×900px, transparent background (PNG-32 with alpha, no
>   background color of any kind — not even a subtle vignette fill).
> - The lockup should be horizontally centered with modest breathing room
>   on all sides (don't crop the bevel/shadow at the canvas edge).
> - This must be an ORIGINAL illustration in this style — do not copy,
>   trace, or closely imitate the logo of any real, existing commercial
>   game or franchise.
> - Do not improvise a different letter-spacing, a different color split
>   between the two words, or additional decorative elements not shown in
>   the reference.
>
> First, generate ONE review sheet: the wordmark shown at full size on a
> plain dark-navy background (so I can check the transparency and bevel
> clearly), labeled "wordmark-meld-masters.png — 2400×900". Stop there
> and wait for my approval before producing the final export.
>
> Once I approve: export the final file as a transparent PNG at exactly
> 2400×900px, named `wordmark-meld-masters.png`, targeting under 400KB
> (optimize/compress if needed without visibly degrading the bevel
> detail).

---

## Batch 2 — Board and rack

**Attachments:**
- `docs/design-reference/meld-masters/meld-masters-concept-01.png`
- `docs/design-reference/meld-masters/meld-masters-concept-04.png`
- `docs/design-reference/tabletop-art-production-templates/board-frame-desktop.svg`
- `docs/design-reference/tabletop-art-production-templates/board-frame-phone-portrait.svg`
- `docs/design-reference/tabletop-art-production-templates/board-frame-phone-landscape.svg`
- `docs/design-reference/tabletop-art-production-templates/rack-frame.svg`

**Prompt:**

> Same project as before (Meld Masters, an original retro-arcade tile
> game). This batch is **four assets**: three board-frame variants and
> one rack frame. The four SVG attachments are technical guide templates
> I made — they show exact canvas size, the transparent safe zone where
> live game tiles will render on top of your art (labeled "LIVE CONTENT —
> DO NOT PLACE DECORATION HERE" in the guide), and (for the rack) the
> nine-slice stretch guide lines. Follow their measurements exactly; they
> are not final art, just technical rulers.
>
> **Asset 1: `board-frame-desktop.png`** — 1728×940px, transparent PNG.
> A tapered arcade-cabinet playfield frame matching the "ON THE TABLE"
> board in meld-masters-concept-01.png: narrower top edge, full-width
> bottom edge (see the guide SVG for the exact taper angle — match it
> precisely, don't reinterpret it), a bright cyan glass-panel highlight
> line just inside the outer glowing border, a subtle diagonal light
> sweep across the surface, and a decorative bracket/chevron motif at the
> top flanking the space where live "ON THE TABLE" text will render (that
> exact spot must stay visually quiet, not textured). Leave the entire
> region marked "LIVE CONTENT" in the guide fully transparent/unobstructed
> except for a very subtle background wash — real game tiles will be
> composited there and must stay fully legible.
>
> **Asset 2: `board-frame-phone-portrait.png`** — 748×560px, transparent
> PNG. Same treatment as Asset 1, but its own dedicated composition at
> this narrower aspect ratio — do not just shrink Asset 1. Reference
> meld-masters-concept-04.png for how the board reads at phone
> proportions.
>
> **Asset 3: `board-frame-phone-landscape.png`** — 1068×546px,
> transparent PNG. Same family, a third dedicated composition at this
> short/wide aspect ratio.
>
> **Asset 4: `rack-frame.png`** — 480×96px, transparent PNG, nine-slice
> guide insets top 28px / right 24px / bottom 14px / left 24px (see the
> rack guide SVG). This is the rack tray shell directly under the board
> in meld-masters-concept-01.png — the top 28px band must read as a
> distinctly thicker, beveled ivory/tan divider (a highlight along its
> very top edge, a shadow just beneath it) welding it to the board above;
> side and bottom edges are thinner and plainer. The center region (the
> tray interior) must be a smooth, evenly stretchable fill with no
> unique per-pixel detail — it will be stretched both horizontally and
> vertically by software, so avoid any one-off decorative element in the
> middle.
>
> None of these four assets may contain any tiles, melds, captions,
> counts, scores, or other game-state text/data — they are backgrounds
> only, composited behind live content.
>
> These must be ORIGINAL illustrations in this arcade-cabinet style — do
> not copy or closely imitate any real, existing commercial game's UI.
>
> First, generate ONE review sheet showing all four assets at reduced
> size side by side on a plain dark-navy background, each labeled with
> its filename and dimensions. Stop there and wait for my approval.
>
> Once I approve: export all four as transparent PNGs at their exact
> specified dimensions, using the exact filenames above, each under
> 500KB (board variants) / 150KB (rack).

---

## Batch 3 — Competitor frames (optional)

**Attachments:**
- `docs/design-reference/meld-masters/meld-masters-concept-01.png`
- `docs/design-reference/meld-masters/meld-masters-concept-roster.png`
- `docs/design-reference/tabletop-art-production-templates/competitor-card-frame.svg`

**Prompt:**

> Same project (Meld Masters). This batch is **two assets**: a neutral
> competitor-card frame and its active-turn glow overlay. Follow the
> attached SVG guide's exact canvas size, safe content zone, and
> nine-slice insets.
>
> **Asset 1: `competitor-card-frame.png`** — 500×350px, transparent PNG,
> nine-slice insets 30px on all four sides. A single NEUTRAL (light gray
> or off-white line-art, NOT colored) card frame matching the competitor
> cards in meld-masters-concept-01.png's left rail — a notched/cut-corner
> rounded rectangle with a subtle beveled border. Do NOT bake in any
> accent color (gold/purple/pink/green) — the real app applies per-player
> color via software on top of this neutral frame. Do NOT include any
> portrait, name, or score — those are separate live content composited
> on top (the roster reference image is for character-portrait style
> context only, not to be included in this frame asset).
>
> **Asset 2: `competitor-active-overlay.png`** — 500×350px, transparent
> PNG, same nine-slice insets as Asset 1. A glow/highlight overlay
> (bright ring, soft outer glow) meant to be layered on top of Asset 1
> only for the currently-active player's card. Contains no color of its
> own beyond a neutral bright glow — the software applies the actual
> per-player accent color.
>
> These must be ORIGINAL illustrations — do not copy or closely imitate
> any real, existing commercial game's UI.
>
> First, generate ONE review sheet: both assets shown at reduced size on
> a plain dark-navy background, and additionally show Asset 1 with a
> plain colored border added in 4 example colors (cyan, purple, pink,
> green) just so I can preview how recoloring will look — but do NOT
> export those 4 colored versions as final files, they're preview-only.
> Stop and wait for my approval.
>
> Once I approve: export the two base assets (Asset 1 and Asset 2 only,
> neutral, not the 4 preview recolors) as transparent PNGs at 500×350px,
> using the exact filenames above, each under 90KB.

---

## Batch 4 — Sidebar (optional)

**Attachments:**
- `docs/design-reference/meld-masters/meld-masters-concept-01.png`
- `docs/design-reference/tabletop-art-production-templates/sidebar-panel-frame.svg`
- `docs/design-reference/tabletop-art-production-templates/countdown-screen-bezel.svg`

**Prompt:**

> Same project (Meld Masters). This batch is **up to three assets**;
> the third is optional and only needed if you want a mascot icon —
> mention if you'd rather skip it.
>
> **Asset 1: `sidebar-panel-frame.png`** — 580×440px, transparent PNG,
> nine-slice insets 24px on all four sides (see the attached guide). A
> single reusable panel frame matching the right-rail boxes (turn status,
> move log, how-to-play) in meld-masters-concept-01.png's right column —
> a notched-corner bordered box with a subtle glow. One neutral asset
> reused for every sidebar section, not a separate design per section.
>
> **Asset 2: `countdown-screen-bezel.png`** — 420×160px, transparent PNG,
> nine-slice insets 20px on all four sides (see the attached guide). A
> small inset "LCD screen" style bezel meant to sit directly behind the
> live turn-countdown digits (e.g. "01:12") — a slightly recessed dark
> panel with a thin bright edge, evoking a digital readout. Do NOT
> include any digits, colons, or numbers of any kind — this is a frame
> only, the actual time value is live text rendered on top.
>
> **Asset 3 (optional, tell me if you'd rather skip): `mascot-tip-icon.png`**
> — 240×240px, transparent PNG. A small original robot/helper mascot
> icon in the same retro-arcade style as the rest of the kit, for a
> "tip of the day" callout. This must be a wholly original character
> design — not based on, inspired by, or resembling any existing game's
> mascot or robot character.
>
> None of these may contain any move-log entries, help text, status
> messages, or countdown digits — frames only.
>
> These must be ORIGINAL illustrations — do not copy or closely imitate
> any real, existing commercial game's UI or characters.
>
> First, generate ONE review sheet with all assets you're producing this
> batch shown at reduced size on a plain dark-navy background. Stop and
> wait for my approval.
>
> Once I approve: export each as a transparent PNG at its exact specified
> dimensions, using the exact filenames above, each under 90KB (Asset 1),
> 40KB (Asset 2), 60KB (Asset 3).

---

## Batch 5 — Buttons and icons

**Attachments:**
- `docs/design-reference/meld-masters/meld-masters-concept-01.png`
- `docs/design-reference/tabletop-art-production-templates/action-plate.svg`

**Prompt:**

> Same project (Meld Masters). This batch is **three required assets**
> (button plates) plus **two optional** (state overlay and illustrated
> icons — tell me if you'd rather skip the optional ones).
>
> **Asset 1: `action-plate-cyan.png`**, **Asset 2:
> `action-plate-purple.png`**, **Asset 3: `action-plate-gold.png`** —
> each 480×220px, transparent PNG, nine-slice insets 32px on all four
> sides (see the attached guide). Three color variants of the same
> chunky 3D cabinet-button plate shown in the action row of
> meld-masters-concept-01.png (Draw/Pass/Sort/Commit Turn buttons): a
> rounded rectangle with a bright highlight band along the top ~15% and
> a darker shadow band along the bottom ~15%, giving a raised, physical
> "cabinet button" look. Cyan and purple are outlined/hollow (dark
> interior, colored border and highlight); gold is a filled, visibly
> brighter/heavier plate — it must read as clearly the strongest,
> most emphasized button of the three when placed side by side. The
> center of each plate (inside the nine-slice safe zone) must be a
> smooth, evenly stretchable fill — no unique per-pixel decoration in
> the middle, since it will be stretched to fit several different button
> sizes.
>
> Do NOT include any text, label, or icon on these plates — they are
> backgrounds only. Live label text ("Draw", "Pass", "Sort", "Commit
> Turn") and separately-designed icons are composited on top by
> software.
>
> **Asset 4 (optional): `action-plate-states.png`** — 480×220px,
> transparent PNG, same nine-slice insets as Assets 1–3. A single
> semi-transparent overlay treatment (a darkening wash for a "pressed"
> look) meant to be layered on top of any of the three base plates via
> software compositing — not a separate full plate per state.
>
> **Asset 5 (optional): `action-icons-illustrated.svg`** — a set of 4
> original vector icons for Draw, Pass, Sort, and Commit Turn, in the
> retro-arcade line-icon style of meld-masters-concept-01.png's action
> row (a stack-of-tiles icon for Draw, a raised-palm icon for Pass, an
> ascending-bars icon for Sort, a right-arrow-in-a-circle icon for
> Commit). Simple, bold, single-color (so it can be recolored via CSS
> `currentColor`), each icon centered in its own 96×96 viewBox.
>
> These must be ORIGINAL designs — do not copy or closely imitate any
> real, existing commercial game's button or icon art.
>
> First, generate ONE review sheet showing all assets you're producing
> this batch at reduced size on a plain dark-navy background (show the
> three color plates side by side so I can judge the gold-vs-cyan-vs-
> purple visual weight balance directly). Stop and wait for my approval.
>
> Once I approve: export Assets 1–3 (and 4 if included) as transparent
> PNGs at exactly 480×220px using the exact filenames above, each under
> 70KB; export Asset 5 (if included) as a single SVG file named
> `action-icons-illustrated.svg` under 20KB total.

---

## Batch 6 — Optional chrome

**Attachments:**
- `docs/design-reference/meld-masters/meld-masters-concept-04.png`

**Prompt:**

> Same project (Meld Masters). This batch is **one small optional
> asset**.
>
> **Asset: `footer-chrome-icons.svg`** — a pair of tiny original vector
> glyphs (a lightning-bolt icon and a bar-chart/stats icon), in the
> retro-arcade line-icon style, matching the small decorative corner
> icons in the bottom footer strip of meld-masters-concept-04.png. Each
> icon in its own 64×64 viewBox, simple single-color line art (so it can
> be recolored via CSS `currentColor`).
>
> These must be ORIGINAL designs — do not copy or closely imitate any
> real, existing commercial game's icon art.
>
> First, generate ONE review sheet showing both icons at reduced size on
> a plain dark-navy background. Stop and wait for my approval.
>
> Once I approve: export as a single SVG file named
> `footer-chrome-icons.svg`, under 10KB.
