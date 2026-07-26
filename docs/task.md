# Current task — Meld Masters visual refresh

**Active initiative:** Meld Masters visual refresh (rename Tile Meld →
Meld Masters, retro-arcade visual redesign, new smartphone/PWA icon
pipeline). Authoritative plan: `docs/meld-masters-visual-refresh-plan.md`.

**Current checkpoint: Phase 0 — Baseline and reference audit.**

**Implementation state: no rename or visual implementation has started.**
No branding string has changed, no CSS/styling has changed, no icon has
been derived, and no game behavior has changed. Phase 0 is scoped to
verification, documentation, and baseline capture only.

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

**Phase 0 checkpoint: committed** despite one known, pre-existing gate gap —
see candidate-work item 2 below and `docs/meld-masters-phase-0-summary.md`
§11 for the full investigation. The user explicitly authorized committing
with this gap documented (2026-07-26): Phase 0 touched no application code,
the full unit/integration gate and build were clean, and the one e2e
failure is order-dependent and pre-existing (reproduced before any Meld
Masters implementation began).

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

**Phase 1 — Branding centralization and public rename** (plan §11). Phase 0
is committed; Phase 1 has not started in this session (per the user's
explicit instruction) and needs its own separate go-ahead. Before starting
it, resolve or at least triage candidate-work item 2 above (the
`public-lobby.spec.ts` Quick Join gap), since Phase 1's own verification
gate includes a chromium e2e run.

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

2. **Investigate and fix the order-dependent `public-lobby.spec.ts` Quick
   Join failure**, surfaced 2026-07-26 during Meld Masters Phase 0
   verification. Reproduced twice in full 33-spec chromium runs (against two
   different, independently freshly created databases); passes reliably in
   isolation. Likely mechanism: Quick Join matches "the oldest idle open
   public room system-wide" (`findQuickJoinableRoom`,
   `apps/server/src/db/repositories/rooms.ts`), and an earlier spec in the
   same run can leave a public room with exactly one free seat; joining it
   auto-starts the room (Phase 4 capacity behavior) and redirects straight
   to the Tabletop, so the test's expected "Leave room" waiting-room control
   never appears. Full diagnostic trail, both ruled-out false starts, and
   the reasoning are in `docs/meld-masters-phase-0-summary.md` §11. Not
   fixed there — out of scope for a documentation-only phase. Do this
   **before or during the Phase 1 verification checkpoint** (Phase 1 also
   requires a clean chromium e2e run per
   `docs/meld-masters-visual-refresh-plan.md` §11), so Phase 1 doesn't
   inherit an already-known-red spec. Also run the full 5-project Playwright
   matrix once this is resolved (only chromium has been run so far) and
   record the result, so E2E moves from unverified to verified.
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
