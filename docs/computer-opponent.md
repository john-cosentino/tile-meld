# Computer Opponent (Play vs Computer) — v1

A simple, deterministic, single-player computer opponent so one human can play a
complete 1v1 Tile Meld game without a second person. It is intentionally
**correct and competent, not expert**: no long-term strategy, opponent
modelling, or search over full games.

Scope: exactly **1 human + 1 computer** in a **private 2-seat** room. No
multiple bots, no bots in 3–4 player games, no computer-vs-computer.

## How it fits together

| Concern | Where | Notes |
|---|---|---|
| Rules authority | `packages/engine` | Unchanged. The single source of legality; the bot never re-implements rules. |
| Move generation | `packages/bot` (`@tile-meld/bot`) | **Pure** (only depends on the engine). `generateBotTurn(input)` → commit / draw / pass. Deterministic branch-and-bound with a fixed node budget; ranking: win → most tiles → most face value → stable canonical tile-id. Its input type cannot even represent the human's rack. |
| Orchestration | `apps/server/src/game/botTurn.ts` | Read a bot-safe snapshot → generate **outside** any transaction → submit through the **same** authoritative `commitTurn`/`drawTurn`/`passTurn` path a human uses (lock + idempotency + version/turn checks + engine + persistence + redaction-safe broadcast). |
| Durability / recovery | `apps/server/src/game/deadlineSweep.ts` (`runBotTurnSweepOnce`) | The embedded sweep is the correctness backstop; the ~1s fast-path timer is latency-only. No Redis/queue/worker added. |
| Identity | `players.kind='computer'` (Phase A) | One global, **credential-less** computer player (a DB CHECK forbids giving it a recovery secret); nobody can authenticate as it. `controller_type` snapshots are DB-derived from `players.kind`. |
| Room creation | `POST /api/rooms/vs-computer` | Private, capacity-2, `has_computer=true`; human host (not ready) + bot member (intrinsically ready). Feature-flag gated. |
| Exclusions | rooms repo / `/join` | Bot rooms are private (excluded from lobby + quick-join) and `/join` rejects them (409). |
| UI | `apps/web` | Home "Play vs Computer (beta)" button; waiting-room BOT badge; tabletop "Computer is playing…" state; screen-reader announcement; the bot's rack is never shown (redaction: opponents expose a count only). |

## Determinism & privacy invariants

- **Deterministic:** identical inputs always yield the identical move (no
  randomness in move selection; no wall-clock cutoff — a fixed node budget).
- **Server-authoritative:** the bot proposes; the engine validates. Every bot
  commit passes the same `validateTurn` a human's does.
- **Safe no-ops:** duplicate / stale / concurrent / completed-game /
  wrong-active-seat bot executions all collapse to no-ops (idempotency key
  `bot:{turnId}` + the games-row lock + version/turn checks).
- **No leakage:** the human's private rack and the hidden pool order never cross
  into the generator, logs, API, realtime messages, or UI. Logs use safe fields
  only (ids, action category, counts, duration) — never rack contents, pool
  order, secrets, or tokens.

## Configuration

Both are read on the server (`apps/server/src/env.ts`); see `.env.example` and
`render.yaml`.

- `ENABLE_COMPUTER_OPPONENT` — **enabled by default** (only an explicit
  `"false"` disables it). Operational kill switch: disabling blocks *new*
  bot-room creation (the endpoint returns 404); in-flight games keep running and
  recover. Not a schema change.
- `BOT_TURN_DELAY_MS` — UX-only delay before the bot acts (default ~1000ms; set
  to 0 in tests). Not a correctness mechanism.

## Rollback

The feature flag is the disable path. Migration `0018` is additive and its
`down()` is **not** safe once computer games exist; a real schema change must be
a forward corrective migration, never `migrate:down` in production.

## Tests

- Pure move generation + properties: `packages/bot/test`.
- Server orchestration, concurrency, stale-snapshot, recovery/restart-
  equivalent: `apps/server/test/game/botTurn.test.ts`.
- Room API / lifecycle / exclusions / flag: `apps/server/test/http/vsComputer.test.ts`.
- Redaction (`isComputer`, no rack leak): `apps/server/test/db/redact.test.ts`.
- Web UI unit/component: `apps/web/test/{HomePage,WaitingRoomPage,TabletopComputerTurn}.test.tsx`.
- End-to-end (desktop + phone viewports): `e2e/tests/vs-computer.spec.ts`.

Real Safari (desktop macOS + iOS) is a manual release-gate check; Playwright's
WebKit engine is a best-effort proxy only.
