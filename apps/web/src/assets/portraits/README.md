# `assets/portraits/`

Production character-portrait assets (Phase 5,
`docs/meld-masters-visual-refresh-plan.md` §9.3 and §11 Phase 5). See
`apps/web/src/branding/portraits.ts` for the registry and the deterministic
seat/participant → portrait mapping that actually uses these files.

## Source of truth

The approved originals live under
`docs/design-reference/meld-masters/` (`portrait-rival-01.png` ..
`portrait-rival-08.png`, `portrait-fallback.png`, plus the reference-only
`meld-masters-concept-roster.png`, which is never imported by the app).
**Those originals are never modified** — the files here are a derived,
resized copy, produced by `scripts/derive-portraits.py` (mechanical
resize + PNG re-compression only, no content/composition change).

## File list

```
portrait-rival-01.png .. portrait-rival-08.png   -- the 8 approved rival portraits
portrait-fallback.png                             -- used when a mapping fails or is out of range (see below)
```

## Fallback meaning

`portrait-fallback.png` is a normal portrait asset, not a broken-image
placeholder — it renders whenever `portraits.ts`'s mapping function can't
resolve a specific rival (an out-of-range index, or missing data), so the
UI never shows a missing-image icon or an empty box.

## Dimensions

128×192 (2:3, matching the source aspect ratio) — resized down from the
approved 1024×1536 originals. This is a deliberate deviation from this
project's earlier-documented 512×512/1:1 portrait contract
(`docs/meld-masters-visual-refresh-plan.md` §9.3), because the assets
actually delivered are 2:3, not square; see
`docs/meld-masters-phase-5-summary.md` for the full discussion. 128px wide
is roughly 2x the largest planned on-screen display size (a ~56px portrait
frame), so it stays crisp on high-DPI screens.

Regenerate with `python3 scripts/derive-portraits.py` (deterministic;
rerunning reproduces byte-identical output).
