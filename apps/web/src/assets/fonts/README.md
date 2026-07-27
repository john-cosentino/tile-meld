# Silkscreen (self-hosted)

Display font used for the Meld Masters wordmark, major headings, panel
titles, and compact arcade labels (never body text, form instructions,
chat, tile numbers, or recovery codes — those stay on the system font
stack). Approved decision D5, `docs/meld-masters-visual-refresh-plan.md`
§8.3/§15.

## Source

Downloaded directly from the official Google Fonts repository (not a
third-party mirror):

- Repo: <https://github.com/google/fonts>
- Path: `ofl/silkscreen/`
- Files fetched: `OFL.txt`, `Silkscreen-Regular.ttf`, `Silkscreen-Bold.ttf`
- Fetched 2026-07-26 via `raw.githubusercontent.com/google/fonts/main/ofl/silkscreen/...`
- Designer: Jason Kottke. Upstream project:
  <https://github.com/googlefonts/silkscreen>

The two `.ttf` files were converted to `.woff2` with `ttf2woff2` (a
lossless container conversion of the same outlines, not a re-derivation)
and are not themselves kept in this directory — only the runtime `.woff2`
files and the license.

## License

SIL Open Font License 1.1 — see `OFL.txt` in this directory (the exact,
unmodified file from the source repository above). Copyright 2001 The
Silkscreen Project Authors.

## Files in this directory

- `OFL.txt` — the license, verbatim.
- `Silkscreen-Regular.woff2`, `Silkscreen-Bold.woff2` — the two static
  weights the upstream project ships, self-hosted and served from this
  app's own origin. No runtime request is ever made to Google Fonts or
  any other external host.
