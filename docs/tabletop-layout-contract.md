# Tabletop artwork-ready layout contract

> Phase 8 deliverable (docs/next-changes-implementation-plan.md §7.7,
> "Artwork contract (prep now, apply later)"). Defines the tabletop's
> stable, named layout regions and the future artwork **slots** each one
> could accept — without supplying, generating, or referencing any actual
> artwork. This is a layout-and-contract document, not a visual-theme
> document; the retro Mahjong/Nintendo/Konami/pixel-art theme itself is
> explicitly a **separate, later, not-yet-started phase** (see
> `docs/phase-08-tabletop-layout.md`'s scope exclusions).

## How to read this document

Each region below is a real DOM element in `apps/web/src/pages/
TabletopPage.tsx` (and, where noted, a dedicated component under
`apps/web/src/tabletop/`) today, styled with a plain CSS class in
`apps/web/src/styles/global.css` and **zero image assets**. When artwork
eventually arrives (Phase 9+, blocked on a supplied reference — see
`apps/web/src/assets/tabletop/README.md`), it is layered onto these
EXACT same elements via CSS (`background-image` or an absolutely-positioned
decorative `::before`/sibling element with `pointer-events: none`), never
by replacing the underlying HTML structure. The region names, DOM
ownership, and fallback behavior defined here are the contract a future
artwork pass must honor; the CSS `background`/layering details are
deliberately left as "not yet decided" where the artwork itself would
decide them (e.g., exact crop vs. contain) — this document fixes the
**constraints**, not a specific asset's presentation.

## Global rules (apply to every slot below)

These are the non-negotiable asset-safety rules, restated from
`apps/web/src/assets/tabletop/README.md` (the authoritative copy — kept in
sync with this document, not a separate policy):

- Assets are decoration only; no gameplay, accessibility, or correctness
  guarantee may depend on one loading.
- Interactive controls (buttons, drop zones, tiles, links, forms) are
  always live HTML, never baked into an image.
- Text is always live HTML, never baked into artwork.
- A purely decorative image/background never captures pointer events
  (`pointer-events: none`, or a CSS `background-image`, which never
  intercepts pointer events regardless).
- A missing/failed/never-added asset must leave the interface exactly as
  usable as it is today (every slot's "fallback when no asset exists" is
  simply: today's existing plain CSS treatment, unchanged).
- No copyrighted Rummikub artwork, logos, tile faces, screenshots, or
  traced commercial layouts; no NES/Konami/Nintendo/other third-party
  branded assets. Original work only.
- `prefers-reduced-motion: reduce` (already enforced globally in
  `global.css`) applies to any future animated asset the same as it does
  to everything else on the site today.

---

## Slot: status background/frame

- **Slot name:** `tabletop-status-frame`
- **React/CSS owner:** `apps/web/src/tabletop/TabletopStatus.tsx`, class
  `.tabletop-status`.
- **Purpose:** a decorative frame or background behind the turn-ownership
  H1, connection indicator, and deadline countdown — the single most
  important glanceable region on the page.
- **Desktop behavior:** full-width bar/card at the top of the primary
  column; an asset would sit as a `background-image` on `.tabletop-status`
  itself (a fixed-height, wide, short-aspect region).
- **Mobile behavior:** same element, same background approach, narrower
  width; content reflows (already wraps via the existing `.row` class) at
  narrow widths, so any background must tolerate the region's height
  growing by one row when the turn text and connection indicator wrap
  onto separate lines.
- **Crop/contain/repeat/stretch:** `cover` or a horizontal `repeat-x`
  strip are both plausible for a short, wide bar; `contain` would leave
  visible gaps at this aspect ratio and is not recommended, though nothing
  here forbids it if a future asset is designed for it.
- **Safe content area:** the entire padded interior (`--space-3 --space-4`
  inset) must stay legible — this is where the H1 and connection text
  render; no asset may reduce contrast below the requirement in "Contrast
  and legibility" below.
- **Expected aspect-ratio behavior:** wide and short (bar-shaped); height
  is content-driven (the H1's line-height plus one optional wrapped row),
  not fixed by the asset.
- **Layering:** background layer only, behind all text/controls in this
  region (`z-index` below content, or a `background-image` on the same
  element, which is implicitly behind its own text content).
- **Interactive content above it:** none currently (this region has no
  buttons), but any future interactive addition here would render above
  the asset by default DOM/stacking order.
- **Contrast and legibility requirements:** the H1 text and connection
  indicator must maintain at least WCAG AA contrast (4.5:1 for normal
  text) against whatever the asset renders behind them at every point the
  text can appear over — if an asset can't guarantee this everywhere, a
  semi-opaque scrim between the asset and the text is required.
- **Reduced-motion requirements:** no animation on this slot may run when
  `prefers-reduced-motion: reduce` is set; a static frame is always safe.
- **Fallback when no asset exists (today's actual behavior):** solid
  `var(--color-surface)` background with a `var(--color-border)` border,
  as implemented in this phase.

## Slot: opponent strip

- **Slot name:** `tabletop-opponents-frame`
- **React/CSS owner:** `apps/web/src/tabletop/OpponentStrip.tsx`, class
  `.tabletop-opponents` (a `<ul>`).
- **Purpose:** a decorative backing behind the horizontal list of opponent
  name/rack-count/status entries.
- **Desktop behavior:** a horizontal wrapping strip; an asset would most
  naturally be a repeating horizontal texture/background behind the whole
  `<ul>`, not per-opponent artwork (per-seat framing is a plausible LATER
  extension but is not defined as a slot here — out of scope until
  actually needed).
- **Mobile behavior:** the same list wraps to multiple rows at narrow
  widths (existing `flex-wrap: wrap` behavior, unchanged by this phase);
  any background must tile/stretch cleanly across a variable, multi-row
  height.
- **Crop/contain/repeat/stretch:** `repeat-x` (a seamless horizontal
  texture) is the best fit for a variable-width, variable-height strip;
  `cover`/`stretch` risk visible distortion once the list wraps to 2+ rows
  on a 3-/4-player game viewed on a narrow phone.
- **Safe content area:** each `<li>`'s full text (name, tile count,
  resigned/computer markers) must stay legible; no per-opponent artwork
  may crop or obscure any individual entry's text.
- **Expected aspect-ratio behavior:** variable height (1–2 rows depending
  on opponent count and viewport width) — no fixed aspect ratio is
  assumable.
- **Layering:** background only, behind the `<li>` text.
- **Interactive content above it:** none today (opponent entries are not
  interactive); must remain true if this ever changes.
- **Contrast and legibility requirements:** each opponent's `.muted` text
  must keep AA contrast against the asset; the resigned/computer markers
  (parenthetical text, not color-only) must remain readable too.
- **Reduced-motion requirements:** same as the status frame — static only
  when `prefers-reduced-motion: reduce`.
- **Fallback when no asset exists:** no background at all (transparent,
  inheriting the page background) — the current implementation.

## Slot: central board/table surface

- **Slot name:** `tabletop-board-surface`
- **React/CSS owner:** `TabletopPage.tsx`'s `.tabletop-board` wrapper
  around `apps/web/src/tabletop/Table.tsx`.
- **Purpose:** the visual centerpiece of the page — a felt/mat-style
  background behind the table's sets and the "start a new set" drop zone.
- **Desktop behavior:** the dominant element of the primary column,
  `min-height: 18rem` today, growing with content; a background image
  would sit behind every `TableSet`/drop-zone and must remain visible
  through the existing semi-transparent `.drop-zone.is-over` accent tint
  (`color-mix(in srgb, var(--color-accent) 8%, transparent)`).
- **Mobile behavior:** same element, full available width, height still
  content-driven; must not force a fixed aspect ratio that would crop
  content or create excess empty space on a short phone viewport.
- **Crop/contain/repeat/stretch:** `cover` is the most likely fit for a
  "felt surface" texture (it should fill the region regardless of exact
  aspect ratio); a subtle `repeat` tile is also plausible and arguably
  safer against cropping since board height is unbounded (a large table
  can grow well past the `min-height`).
- **Safe content area:** the entire padded interior. **Every tile drop
  target inside this region must remain fully visible and uncovered** —
  this is a hard requirement (see "Asset safety rules" — drop targets
  specifically) since dnd-kit's collision detection is geometry-based, not
  visual, but a covered/illegible drop zone is unusable even if drag
  mechanically still works.
- **Expected aspect-ratio behavior:** unbounded height (a full 4-player
  endgame board can have many sets); any asset must tile or stretch
  gracefully rather than assuming a fixed canvas size.
- **Layering:** background only. Sets, tiles, and drop-zone borders render
  above it via normal DOM order — never behind, never intercepting drag
  events.
- **Interactive content above it:** yes, extensively — every `TableSet`'s
  `DropZone`, every `Tile`, the "start a new set" zone, and each tile's own
  drag handle. All of it is live HTML/dnd-kit today and must remain so; an
  asset is strictly a background layer.
- **Contrast and legibility requirements:** the existing `.drop-zone`
  dashed border and `.valid`/`.invalid` colored border states (green/red,
  text-labeled redundantly via each set's "Set N -- {label}" text) must
  stay visually distinguishable against any future background — if a
  felt-texture asset reduces that distinction, the drop-zone border colors
  may need adjusting at that time, but the text label is the actual
  accessibility guarantee (already true today, unaffected by any future
  asset).
- **Reduced-motion requirements:** a static texture is always safe; no
  ambient animation on this slot without respecting the reduced-motion
  query.
- **Fallback when no asset exists:** solid `var(--color-surface)`
  background with a `var(--color-border)` border — the current
  implementation, with `min-height: 18rem` so the region never reads as a
  narrow band even when empty ("No sets on the table yet.").

## Slot: rack surface

- **Slot name:** `tabletop-rack-surface`
- **React/CSS owner:** `TabletopPage.tsx`'s `.tabletop-rack` wrapper around
  `apps/web/src/tabletop/Rack.tsx`.
- **Purpose:** a background visually distinguishing the player's own rack
  from the shared board — today done with a plain accent top-border
  (`border-top: 3px solid var(--color-accent)`), a future asset could
  instead (or additionally) use a distinct wood/tray-style texture.
  the sort-mode button group (Manual/Sort by number/Sort by color) and the
  rack's own `DropZone`.
- **Mobile behavior:** same element; the rack already wraps tiles onto
  multiple rows at narrow widths via the existing `.drop-zone` flex-wrap
  behavior (unchanged by this phase) — any asset must tolerate a variable,
  potentially tall region on a narrow phone with a full 14+-tile rack.
- **Crop/contain/repeat/stretch:** `repeat` (a tray/tileable texture) is
  the safer choice for the same reason as the board — height is variable
  and content-driven, not fixed.
- **Safe content area:** the sort-mode button row and every rack tile's
  drop target must stay fully visible and uncovered, same hard requirement
  as the board.
- **Expected aspect-ratio behavior:** variable height depending on rack
  size and viewport width — no fixed aspect ratio assumable.
- **Layering:** background only, behind the sort buttons and tiles.
- **Interactive content above it:** yes — the sort-mode button group and
  every rack `Tile` (draggable and click/keyboard-selectable). Always live
  HTML/dnd-kit, never baked into the asset.
- **Contrast and legibility requirements:** the "Your rack (N)" heading and
  sort-button `aria-pressed` states must stay legible; the rack's own
  `DropZone` valid/invalid border treatment (shared with the board) must
  remain distinguishable.
- **Reduced-motion requirements:** same as every other slot.
- **Fallback when no asset exists:** the current accent top-border
  treatment on `var(--color-bg)` (the page background, not a separate
  surface color) — deliberately visually lighter than the board so the two
  regions read as distinct without needing a second background color
  token.

## Slot: action-bar frame

- **Slot name:** `tabletop-actions-frame`
- **React/CSS owner:** `TabletopPage.tsx`'s `.tabletop-actions` wrapper
  (`role="group" aria-label="Game actions"`).
- **Purpose:** a decorative frame behind the action-button row (Undo,
  Reset turn, Draw tile, Pass, Commit turn, and the separated Resign/
  Confirm group).
- **Desktop behavior:** a single horizontal bar; an asset would be a
  background behind both the `.tabletop-actions-primary` and
  `.tabletop-actions-danger` sub-groups.
- **Mobile behavior:** the same bar, buttons wrap via existing
  `flex-wrap: wrap` (each sub-group wraps independently, so related
  buttons never separate into a confusing order — unchanged behavior from
  this phase). **This phase deliberately does not make this bar sticky**
  (see `docs/phase-08-tabletop-layout.md`'s known limitations) — if a
  later phase adds sticky positioning, any frame asset must still respect
  safe-area insets (`env(safe-area-inset-bottom)`) the same way the
  interactive content would need to.
- **Crop/contain/repeat/stretch:** `cover` or `repeat-x`, same reasoning
  as the status frame (short, wide, variable-height-when-wrapped region).
- **Safe content area:** every button's full clickable/tappable area and
  its disabled-state visual treatment (`opacity: 0.5` today) must remain
  legible against any future background.
- **Expected aspect-ratio behavior:** wide and short normally; taller when
  wrapped at narrow widths or when the resign-confirmation sub-state
  ("Resign for good? / Confirm resign / Cancel") is showing.
- **Layering:** background only, behind every button.
- **Interactive content above it:** yes — every action button. Always live
  HTML `<button>` elements, never baked into the asset, per the global
  rule that interactive controls are never images.
- **Contrast and legibility requirements:** `button.primary` (Commit turn)
  and `button.danger` (Resign/Confirm resign) already carry their own
  solid background colors independent of any page-level asset, so their
  own contrast is unaffected by this slot; the plain (non-primary,
  non-danger) buttons' default surface/border/text colors must remain AA
  against whatever sits behind them.
- **Reduced-motion requirements:** standard.
- **Fallback when no asset exists:** no background at all (transparent) —
  the current implementation; the buttons' own borders/backgrounds already
  provide sufficient visual definition without a frame.

## Slot: chat frame (optional)

- **Slot name:** `tabletop-chat-frame`
- **React/CSS owner:** `TabletopPage.tsx`'s `.tabletop-chat` wrapper
  (containing the disclosure toggle button and `apps/web/src/chat/
  ChatPanel.tsx`, which renders its own `.card` internally).
- **Purpose:** an optional decorative frame around the secondary/
  collapsible chat column. Marked **optional** because chat is explicitly
  the LEAST important region per the phase's own hierarchy (secondary to
  gameplay) — a future artwork pass may reasonably skip this slot
  entirely without the tabletop looking incomplete.
- **Desktop behavior:** the narrower side column (`minmax(240px, 320px)`
  today); an asset would sit behind the toggle button and the (possibly
  hidden) chat panel.
- **Mobile behavior:** full-width, stacked last in the single-column
  layout; must tolerate being either the toggle-button-only height
  (collapsed) or the full expanded chat panel's height.
- **Crop/contain/repeat/stretch:** `cover` for a fixed-ish narrow column
  on desktop; must still look correct at the much wider, shorter mobile
  stacked width — a `repeat` texture is safer across both.
  **Because this region's visible height changes dramatically between
  collapsed and expanded (see "Chat state survives collapse/expand" in
  `docs/phase-08-tabletop-layout.md`), any asset MUST be designed to look
  correct at both heights, not just one** — this is the one slot where
  the artwork itself must explicitly account for a large, discrete height
  change, not just gradual reflow.
- **Safe content area:** the toggle button's full tap target
  (`aria-expanded`/`aria-controls`) and, when expanded, ChatPanel's own
  message log, input, and send button.
- **Expected aspect-ratio behavior:** highly variable (collapsed: short;
  expanded: as tall as the message history plus input) — no fixed
  aspect ratio assumable at all.
- **Layering:** background only, behind the toggle button and ChatPanel's
  own (already-opaque) `.card`. Since ChatPanel already renders its own
  card background, a `tabletop-chat-frame` asset would mostly be visible
  around/behind that card and behind the toggle button itself, not
  "through" the chat log.
- **Interactive content above it:** yes — the toggle button and everything
  inside ChatPanel (message log, input, send button). All live HTML,
  unaffected by this slot.
- **Contrast and legibility requirements:** the toggle button's "Hide
  chat"/"Show chat" text and `aria-expanded` state must remain legible;
  ChatPanel's own internal contrast is independent of this slot (it has
  its own opaque card background already).
- **Reduced-motion requirements:** standard; additionally, if a future
  toggle transition (expand/collapse) ever gains a CSS transition, it must
  respect `prefers-reduced-motion: reduce` the same as every other
  transition site-wide already does via the existing global rule.
- **Fallback when no asset exists:** no background (transparent) — the
  current implementation; ChatPanel's own card provides all necessary
  visual definition.

## Slot: page background (optional, noninteractive)

- **Slot name:** `tabletop-page-background`
- **React/CSS owner:** `.tabletop-shell` (the page-level wrapper) or,
  if ever needed site-wide rather than tabletop-specific, `body`/`.page`
  in `global.css` — **not decided by this document**, since a page-wide
  background is arguably a visual-theme concern (out of scope for Phase 8)
  rather than a tabletop-layout concern. Listed here only because the
  phase instructions explicitly ask for it as an optional slot.
  Marked **optional**; nothing about the current tabletop depends on this
  slot ever being filled.
- **Purpose:** a subtle, non-interactive ambient background behind the
  entire tabletop shell (outside/around every other region above).
- **Desktop behavior:** fills the viewport behind the centered `.page`
  container (currently `max-width: 960px`, unchanged by this phase — see
  `docs/phase-08-tabletop-layout.md`'s note on why the global page
  max-width was deliberately left untouched).
- **Mobile behavior:** fills the viewport; must never introduce horizontal
  scroll/overflow at any width (a hard requirement independent of any
  asset — see the phase's "no horizontal page overflow" test coverage).
- **Crop/contain/repeat/stretch:** `cover` (viewport-filling) is the
  expected treatment for a page background.
- **Safe content area:** effectively the entire viewport is "unsafe" for
  meaningful content in the sense that this layer sits BEHIND every other
  region defined above — it must never visually compete with or reduce
  legibility of any of them.
- **Expected aspect-ratio behavior:** must scale to any viewport size
  without visible seams or distortion at common desktop and phone
  aspect ratios.
- **Layering:** the bottommost layer of the entire page — behind the
  status bar, opponent strip, board, rack, actions, and chat regions,
  all of which already have their own (currently solid-color) backgrounds
  that would sit above this one.
- **Interactive content above it:** everything — this is strictly
  ambient/decorative and must never intercept a click, tap, or drag
  anywhere on the page (`pointer-events: none` if implemented as an
  overlay element; inherently true if implemented as a CSS
  `background-image`).
- **Contrast and legibility requirements:** must not reduce any
  foreground region's contrast below what it already achieves against the
  current plain `var(--color-bg)` — in practice this means staying subtle
  enough that every region's own solid background (card/surface colors)
  remains the dominant visual layer wherever content actually renders.
- **Reduced-motion requirements:** standard; a page-wide ambient
  animation is the single most likely place a future theme might want
  motion, and is exactly where `prefers-reduced-motion: reduce` matters
  most — must be fully static when that preference is set.
- **Fallback when no asset exists:** the current plain `var(--color-bg)`
  site-wide background (light or dark per `prefers-color-scheme`) — no
  change from today.

---

## Confirmation

No asset described above exists in the repository as of this phase. This
document defines constraints for artwork that may be supplied in a future,
separate, not-yet-started phase — it supplies no image, sprite,
background, icon, or other visual asset itself.
