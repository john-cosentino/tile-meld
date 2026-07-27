# Current task — Meld Masters visual refresh

**Active initiative:** Meld Masters visual refresh (rename Tile Meld →
Meld Masters, retro-arcade visual redesign, new smartphone/PWA icon
pipeline). Authoritative plan: `docs/meld-masters-visual-refresh-plan.md`.

**Current checkpoint: Phase 1 — branding centralization and public rename.**
Public product name: **Meld Masters**. `tile-meld` remains the internal
repository name, package scope, and deployment identifier.

**Implementation state:** the public rename is implemented (in progress —
verification underway, see `docs/meld-masters-phase-1-summary.md` once
written). No visual/CSS redesign, no icon derivation, and no game-behavior
change occurred — Phase 1 is scoped to branding text and centralization
only.

## Open blocker

- **B3 — production portrait assets.** No original character portrait
  artwork has been supplied yet. The portraits embedded inside the concept
  screenshots (`docs/design-reference/meld-masters/meld-masters-concept-0{3,4}.png`)
  are reference material only and must not be cropped, traced, or
  reconstructed for production use. This blocks **only Phase 5**
  (character portrait system); Phases 0–4 and 6 do not depend on it.

(Blockers B1 — logo master — and B2 — portrait-correction reference
identity — were resolved 2026-07-26; see
`docs/meld-masters-visual-refresh-plan.md` §2.)

## Phase history

- **Phase 0** (baseline and reference audit) — committed `cc307c2`
  (2026-07-26), with one known, pre-existing e2e gate gap documented and
  explicitly authorized by the user. See `docs/meld-masters-phase-0-summary.md`.
- **Phase 1, Checkpoint A** (e2e test-isolation fix) — committed `15bc370`
  (2026-07-26). Root cause of the `public-lobby.spec.ts` gap from Phase 0
  was investigated further and found to differ from the original Phase 0
  hypothesis: it is not about an earlier spec leaving a room behind, but
  about this spec's OWN prior successful runs leaving a room with exactly
  one free seat, which a later run's Quick Join can legitimately complete
  to capacity — correctly triggering the app's real, shared
  auto-start-on-capacity behavior. Fixed by widening the test's accepted
  outcome to both real states production can produce, not by changing any
  application code. Verified via `--repeat-each=10` (including against an
  already-polluted database) and the full chromium project, both 100%
  clean. See `docs/meld-masters-phase-1-summary.md`.
- **Phase 1, Checkpoint B** (public rename) — in progress this session.

## Pending approvals (needed before Phase 2 begins)

These are recorded as pending, not silently treated as approved:

1. Retiring the functional light theme — both `prefers-color-scheme`
   branches would resolve to the dark arcade palette regardless of system
   preference (plan §15 D2).
2. Adding and self-hosting the Silkscreen font (SIL OFL license) for
   display type (plan §8.3, §15 D5).
3. Optionally placing the Meld Masters monogram
   (`meld-masters-concept-logo.png`) beside the live-text header wordmark,
   as a small decorative `alt=""` emblem (plan §7.1, §2).

## Next phase

**Phase 2 — Design tokens and global arcade foundation** (plan §11), gated
on Phase 1 being reviewed and approved, and on the pending approvals above
being resolved.

## Structure to use when work begins on a new, unrelated task

Replace everything above with:

- **Objective** — one sentence.
- **Inputs** — documents and files the work depends on.
- **Deliverables** — what must exist when this is done.
- **In scope** — explicit list.
- **Out of scope** — explicit list.
- **Constraints** — versions, purity boundaries, contracts not to break.
- **Acceptance criteria** — verifiable statements.
- **Manual verification steps** — exact commands and expected output.

## Checklist for starting the next task

1. `git status` (expect clean on `main`) and `git --no-pager log --oneline -5`.
2. Confirm PostgreSQL is up and migrated.
3. Run the full gate once to confirm a green baseline **before** changing code —
   with `TEST_DATABASE_URL` set, per the warning in `docs/environment.md`.
4. Branch for the new work; implement one reviewable change at a time.
5. Keep `packages/engine` and `packages/bot` pure, and the server authoritative.
6. For anything touching draft/undo, drag-and-drop, or E2E setup, re-read the
   "Areas that require special care" section of `CLAUDE.md` first.
7. Run the gate plus the relevant E2E specs before committing. Stop at the phase
   checkpoint for manual review before starting the next phase.

## Candidate work

Surfaced on 2026-07-25. None selected or prioritised.

**Consistency:**

1. Resolve the retention discrepancy — `docs/changes.md` specifies 4-hour
   deletion of completed games; the implementation is 48 hours (`ac9c2a3`).
   Correct whichever is wrong.

**Verification gaps** (from `docs/current-state.md`):

2. ~~Investigate and fix the order-dependent `public-lobby.spec.ts` Quick
   Join failure~~ **Resolved 2026-07-26** — see "Phase history" above and
   `docs/meld-masters-phase-1-summary.md`. The real root cause (a leftover
   room from the spec's own prior run, not an earlier spec) differed from
   Phase 0's original hypothesis; fixed in the test only, committed
   `15bc370`.
3. Confirm what commit the Render service is actually serving, and whether it is
   healthy.

**Deferred feature work** — clean seams, nothing started:

4. A stronger computer opponent (search, opponent modelling, difficulty levels).
   The current bot is deliberately basic and is "just another caller of the pure
   engine", so a smarter one is additive.
5. Multiple or mixed bots, bots in 3–4 player games, computer-vs-computer. V1
   intentionally excludes these; the domain leaves seams but nothing is built.
6. Accounts / Google sign-in, email notifications, moderation, lifetime stats
   and leaderboards, horizontal scale, a dedicated worker — see
   `docs/opus-implementation-plan.md` §14.2.
