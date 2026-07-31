# Meld Masters — tabletop game-state coverage audit

Phase 2 of the production/stabilization pass (see
`docs/meld-masters-visual-baseline-v1.md` for the locked visual
baseline this work sits on top of). Verified by reading the actual
rendered behavior — `apps/web/src/pages/TabletopPage.tsx`,
`apps/web/src/tabletop/useGame.ts`, `apps/web/src/api/socket.ts`, and
the existing test suites — not assumed from the presence of underlying
logic.

Legend for **Test coverage**: file names are exact, existing test
files unless marked *(new)*.

| State | Trigger | Current UI behavior | Test coverage | Gap found | Correction |
|---|---|---|---|---|---|
| Initial loading | First mount, socket not yet connected | "Loading table…" placeholder, real `<h1>` (visually hidden) for the page title | `TabletopPurgedGame.test.tsx` | None | — |
| Room connection in progress | Socket attempting first connect | `connectionState: "connecting"`, same loading placeholder | `useGame.test.tsx` | Minor: if the server is fully unreachable, this can persist up to ~45s (bounded reconnection attempts) before resolving to a clear "Disconnected" + Reconnect state | Accepted as bounded, not a frozen screen — not fixed further this pass |
| Successful connection | `connect` event | `connectionState: "connected"`, view populated via `game:join` ack | `useGame.test.tsx` | None | — |
| Temporary disconnect | `disconnect` (reason ≠ `io server disconnect`) | Previously: identical to a permanent disconnect ("🔴 Disconnected", no distinction) | `useGame.test.tsx` *(new)*, `TabletopLayout.test.tsx` *(new)* | **Real gap** | Added `"reconnecting"` state, distinct label, live-region announcement once per transition |
| Reconnection attempt | Manager auto-retry in background | Previously invisible (no attempt-level UI, correctly — see below) | — | None (by design) | `reconnect_attempt`/`reconnect_error` deliberately NOT surfaced — would spam the live region on every retry |
| Reconnection success | `connect` after a prior disconnect | Previously: silent, just flipped back to "Connected" | `useGame.test.tsx` *(new)* | **Real gap** | Announces "Reconnected." once |
| Reconnection failure | `reconnect_failed` (Manager exhausted attempts) | Previously: no such terminal state existed (client retried forever) | `useGame.test.tsx` *(new)* | **Real gap** | Bounded `reconnectionAttempts: 10` (socket.ts) + terminal `"disconnected"` state + manual **Reconnect** button (`TabletopStatus.tsx`) |
| Waiting for another player | Room not yet full | Handled by `WaitingRoomPage`, not the tabletop | `WaitingRoomPage.test.tsx`, `accessibility.spec.ts` | None | — |
| Local player's turn | `activeSeat === self.seatIndex` | "Your turn" H1, active-turn glow, actions enabled | `TabletopLayout.test.tsx` | None | — |
| Opponent's turn | `activeSeat !== self.seatIndex` | "Waiting on seat N" / "Computer is playing…" | `TabletopLayout.test.tsx`, `TabletopComputerTurn.test.tsx` | None | — |
| Valid arrangement | Draft matches a real run/group | Set plaque labeled "valid" (`hintForSet`) | `hintEngine.test.ts`, `two-player-smoke.spec.ts` | None | — |
| Invalid arrangement | Draft doesn't match | Set plaque labeled "invalid", plus a proactive hint line before commit | `hintEngine.test.ts`, `invalid-commit-penalty.spec.ts` | None | — |
| Initial meld below threshold | `hasInitialMeld: false`, running total < 30 | "Initial meld progress: N / 30" in the feedback panel | `TabletopLayout.test.tsx` | None | — |
| Initial meld accepted | Server accepts a commit reaching the threshold | Progress line disappears once `hasInitialMeld: true` | Covered indirectly by `turns-initial-meld.test.ts` (engine) | None | — |
| Draw available | `isMyTurn && poolCount > 0` | Draw enabled (cyan plate) | `TabletopLayout.test.tsx`, capture script's enabled-state screenshot | None | — |
| Pool empty | `poolCount === 0` | Draw disabled, Pass enabled — by real engine rule (D-EMPTYDRAW), not a UI simplification | `packages/engine` turn tests | None | — |
| Pass available | `isMyTurn && poolCount === 0` | Pass enabled (purple plate) | Engine tests; not independently screenshotted this pass (Draw+Pass are mutually exclusive, see visual-polish report) | None | — |
| Commit available | `isMyTurn && draft.sets.length > 0` | Commit enabled, gold plate, glow | `TabletopLayout.test.tsx`, capture script | None | — |
| Commit rejected by server | Invalid final arrangement | `actionError` banner: "That arrangement isn't valid -- 3 penalty tiles were drawn and your turn ended." | `invalid-commit-penalty.spec.ts` | None | — |
| Penalty applied | Rejected commit or timeout | Rack count grows, reflected via a fresh `refetch()` | `invalid-commit-penalty.spec.ts`, `turn-timeout.spec.ts` | None | — |
| Undo available/unavailable | `canUndo` | Button enabled/disabled via native `disabled` | `TabletopLayout.test.tsx`, `draftState.test.ts` | None | — |
| Reset Turn available/unavailable | `draftChanged` | Button enabled/disabled | `TabletopLayout.test.tsx` | None | — |
| Player resignation | Self resigns | Confirm-then-resign flow, `role="status"` completion card | `TabletopLayout.test.tsx`, `full-lifecycle.spec.ts` | None | — |
| Opponent resignation | Opponent resigns | Opponent card marked "(resigned)"; game ends if it was the last active seat | `TabletopLayout.test.tsx`, `full-lifecycle.spec.ts` | None | — |
| Round completion | N/A | **This game has no multi-round concept** — confirmed absent from `packages/engine` (`GameStatusSchema` is only `active`/`completed`) | — | Not a gap — nothing to build; documented so it isn't assumed missing | — |
| Game completion | `status: "completed"` | "Game over" H1, completion card, `RematchPanel` | `TabletopPageRematch.test.tsx` | None | — |
| Winner/loser presentation | Game completion | Previously: **no winner shown anywhere**, ever — not even to a client live for the transition, since the one-time `game:over` socket payload was never stored, and the persisted `winner_seat` DB column was never projected into the client-facing view at all | `TabletopPageRematch.test.tsx` *(new)* | **Real gap** | Added `winnerSeatIndex` end-to-end (DB column already existed) — `packages/shared` schema → `apps/server` redaction → client. Durable: correct on reload or a later visit, not just live |
| Empty table | `table: []` | "No sets on the table yet." | `TabletopLayout.test.tsx` | None | — |
| Large number of meld groups | Many `table` entries | `.table-sets-grid` wraps into multiple rows | `phase-4-review` capture (`tabletop-multiple-sets`) | None | — |
| Long rack | Many rack tiles | `.tabletop-rack .tile` list wraps | Visual capture (13+-tile racks appear throughout this session's screenshots) | None | — |
| Long player names | `USERNAME_MAX_LENGTH` (24 chars) | CSS ellipsis truncation, full name via `title` + untruncated accessible text | Visual-polish pass (see prior commit `962c666`) | Already fixed this session, pre-existing gap | — |
| Chat collapsed | Default | "Show chat" toggle, ARIA `aria-expanded="false"`, panel `hidden` | `TabletopLayout.test.tsx` | None | — |
| Chat expanded | User toggles | Panel visible, focus stays sane | `TabletopLayout.test.tsx`, `tabletopMobile.spec.ts` | None | — |
| Empty chat | No messages yet | "No messages yet." in the `role="log"` region | `ChatPanel.test.tsx` | None | — |
| Multiple chat messages | ≥1 message | Listed newest-last, `aria-live="polite"` | `ChatPanel.test.tsx`, `two-player-smoke.spec.ts` | None | — |
| Server or network error | API/socket error mid-session | `banner` (dismissible) for join/socket errors, `actionError` for a failed turn action | `useGame.test.tsx`, various e2e specs | None | — |

## Summary

Of the ~35 states audited, **three genuine gaps** were found and fixed
this pass (reconnection distinction, winner identification, and —
separately, Phase 6 — the complete absence of any in-app rules
content). Everything else was already correctly presented and already
had real test coverage; this audit's job there was verification, not
invention, per the phase's own instruction not to assume a state is
handled because the underlying logic exists.
