# Self-hosted fonts

All fonts here are SIL OFL 1.1 licensed, self-hosted, and served only from
this app's own origin. No runtime request is ever made to Google Fonts or
any other external host.

## Silkscreen

Display font of the original 2026-07 visual refresh (decision D5,
`docs/meld-masters-visual-refresh-plan.md` §8.3/§15).

- Repo: <https://github.com/google/fonts>, path `ofl/silkscreen/`
- Files fetched: `OFL.txt`, `Silkscreen-Regular.ttf`, `Silkscreen-Bold.ttf`
- Fetched 2026-07-26 via `raw.githubusercontent.com/google/fonts/main/ofl/silkscreen/...`
- Designer: Jason Kottke. Upstream: <https://github.com/googlefonts/silkscreen>
- The `.ttf` files were converted to `.woff2` with `ttf2woff2` (lossless
  container conversion); only the runtime `.woff2` files are kept.

## VT323 — the arcade font (2026-08-01)

`--font-arcade`, the single typeface of the concept-art fidelity rebuild.
User-selected at the Phase 2 checkpoint from a four-candidate comparison
against the concept text (`docs/design-reference/arcade-review/
font-candidates.png`); the losing candidates (Press Start 2P,
DotGothic16) were deleted after the decision.

- `VT323-Regular.woff2` — VT323, by Peter Hull. OFL 1.1.
  Upstream: <https://github.com/phoikoi/VT323>
- Latin-subset `.woff2` fetched directly from Google Fonts' CDN
  (`fonts.gstatic.com`) via the `fonts.googleapis.com/css2` API on
  2026-08-01.

## License

SIL Open Font License 1.1 — see `OFL.txt` (verbatim from the Silkscreen
source repository; the same license text governs all fonts listed above,
each under its own copyright holder as named in the font metadata).
