# `assets/tabletop-production/`

Staging directory for the illustrated art assets requested in
`docs/meld-masters-chatgpt-art-production-handoff.md` for the **static
tabletop concept prototype**
(`apps/web/src/prototypes/tabletop-concept/`, route
`/prototype/tabletop-concept`). **No artwork lives here yet.**

This is a different thing from the pre-existing
`apps/web/src/assets/tabletop/README.md` — that directory is reserved for
the **real, live tabletop's** eventual artwork under the Phase 8
layout contract (`docs/tabletop-layout-contract.md`) and is untouched by
this work. Assets approved and integrated here, into the *prototype*,
may or may not ever become the real tabletop's assets — that's a
separate, later, explicitly-deferred decision (see
`docs/meld-masters-tabletop-art-integration-plan.md`'s final checkpoint).
Don't confuse the two directories or their READMEs.

## Directory structure

```
apps/web/src/assets/tabletop-production/
├── masthead/
├── board/
├── rack/
├── competitors/
├── sidebar/
├── actions/
└── chrome/
```

Each subdirectory holds the assets whose `group` in
`apps/web/src/prototypes/tabletop-concept/artRequirements.ts` matches its
name. Git doesn't track empty directories — until the first asset lands
in a given subdirectory, that subdirectory simply won't exist in the
repo; that's expected, not a bug. **Do not add placeholder/empty files
just to make a directory appear in Git** — the dev-only asset lab
(`/prototype/tabletop-assets`) is the actual way to see which slots are
filled, and it reads the real file list via `import.meta.glob`, not this
directory's mere existence.

## Approved filenames

Every filename below is the ONLY name that resolves against a slot in
`artRequirements.ts`. A file with a different name is invisible to the
asset lab and to eventual real integration — it will not be picked up
automatically.

| File | Group | Required |
|---|---|---|
| `masthead/wordmark-meld-masters.png` | masthead | **required** |
| `masthead/plaque-frame.png` | masthead | optional |
| `board/board-frame-desktop.png` | board | **required** |
| `board/board-frame-phone-portrait.png` | board | **required** |
| `board/board-frame-phone-landscape.png` | board | **required** |
| `board/board-surface-texture.png` | board | optional |
| `rack/rack-frame.png` | rack | **required** |
| `competitors/competitor-card-frame.png` | competitors | optional |
| `competitors/competitor-active-overlay.png` | competitors | optional |
| `sidebar/sidebar-panel-frame.png` | sidebar | optional |
| `sidebar/countdown-screen-bezel.png` | sidebar | optional |
| `sidebar/mascot-tip-icon.png` | sidebar | optional |
| `actions/action-plate-cyan.png` | actions | **required** |
| `actions/action-plate-purple.png` | actions | **required** |
| `actions/action-plate-gold.png` | actions | **required** |
| `actions/action-plate-states.png` | actions | optional |
| `actions/action-icons-illustrated.svg` | actions | optional |
| `chrome/footer-chrome-icons.svg` | chrome | optional |

The single source of truth for this table is `artRequirements.ts` — if
they ever disagree, the `.ts` file wins.

## File formats, alpha, and sizing

- **PNG** for every illustrated frame/plate/texture asset — 8-bit alpha
  channel required (`transparency: "required"` in the manifest) unless
  the manifest says otherwise.
- **SVG** only for the two icon-set assets (`action-icons-illustrated.svg`,
  `footer-chrome-icons.svg`) — single-color, `currentColor`-friendly line
  art, no embedded raster images inside the SVG.
- Per-asset **max file size budgets** are in `artRequirements.ts`'s
  `maxBytes` field (also shown live per-asset in the asset lab) — run any
  PNG through a lossless optimizer (e.g. `oxipng`/`pngquant`) before
  committing if it's over budget. There is no automated CI check for this
  yet; it's a manual review step for now.

## Nine-slice conventions

Assets with `stretchMode: "nine-slice"` in the manifest carry a
`nineSliceInsets` object (`top`/`right`/`bottom`/`left`, in source pixels).
Deliver the source PNG at exactly the `sourceDimensions` the manifest
specifies — Claude computes the actual CSS nine-slice/`border-image`
values from the manifest's insets at integration time; you don't need to
pre-slice the image into 9 separate files.

Board-frame assets are the one exception: `stretchMode: "layered"`, not
nine-slice (the tapered silhouette's diagonal edges aren't nine-slice-
compatible — see the handoff doc's board section for why).

## Source of truth and how assets move from ChatGPT into the repo

1. Generate a batch using the corresponding prompt in
   `docs/meld-masters-chatgpt-art-generation-prompts.md`.
2. Review ChatGPT's review sheet; iterate with ChatGPT until it's right;
   only then ask for individual final exports.
3. Save each exported file locally with **exactly** the filename from the
   table above.
4. Drop it into this directory (create the group subfolder if it doesn't
   exist yet — plain `mkdir`, nothing special).
5. Run the dev server and open `/prototype/tabletop-assets` — the asset
   should flip from "NOT SUPPLIED" to a real preview automatically (the
   lab resolves files live via `import.meta.glob`, no manifest edit
   needed for a file that already matches an existing `artRequirement`
   entry).
6. Review the live preview against all three background swatches and, for
   frame assets, the contextual mock-tile/mock-portrait/mock-text overlay.
7. Only after you approve what you see in the lab does integration into
   the actual layout components (`ConceptBoard.tsx`, `ConceptRack.tsx`,
   etc.) happen — see
   `docs/meld-masters-tabletop-art-integration-plan.md` for those staged,
   approval-gated checkpoints. **Nothing in this checkpoint wires an
   asset into the real layout components — the lab is a preview only.**

## Preserving originals

Keep ChatGPT's original, unoptimized export somewhere outside the repo
(your own working folder) before committing the size-optimized version
here — if a re-export or a different crop is ever needed, you want the
source, not a re-compression of the already-compressed committed file.

## Rollback

Deleting a file from this directory (or reverting the commit that added
it) is always safe and non-destructive to the app: every consumer
component falls back to its current CSS-only treatment automatically
(see the integration contract's "missing-asset fallback" section) — there
is no code path that assumes a file here exists.

## Review workflow

Every batch gets its own comparison/overlay/silhouette regeneration
against the concept art (see the integration plan's checkpoints A–E) and
an explicit user approval before the next batch starts. Do not skip a
checkpoint's review step even if a batch "looks obviously fine."

## Rules carried over from the real tabletop's asset contract

The non-negotiable rules in `apps/web/src/assets/tabletop/README.md`
(decoration only, interactive controls stay HTML, text stays live,
`pointer-events: none` on anything decorative, missing assets never
degrade the interface, no copyrighted third-party artwork) apply here
identically. Re-read that file's "Non-negotiable asset rules" and
"Originality and copyright" sections before adding anything — they are
not repeated in full here to avoid the two documents drifting out of
sync.
