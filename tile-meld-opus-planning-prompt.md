# Tile Meld - Opus Planning Prompt for Claude Code

You are Claude Code running with the Opus model. Work as a senior software architect, multiplayer-game systems designer, security reviewer, and delivery planner.

## Current phase: planning only

This is a strict planning and repository-inspection phase. Do not implement the application yet.

You may:

- Inspect the repository and its existing files.
- Run read-only commands needed to understand the repository, such as `pwd`, `ls`, `find`, `git status`, `git log`, and `git diff`.
- Read existing source code, configuration, documentation, tests, and Git history.
- Reason about architecture, data modeling, rules, security, deployment, testing, and phased delivery.
- Present a detailed plan in the Claude Code conversation.

You must not during this phase:

- Create, edit, move, rename, or delete files.
- Install dependencies.
- Run formatters, generators, migrations, builds, or commands that may modify the working tree.
- Run `git add`, `git commit`, `git push`, `git pull`, branch creation, checkout/switch, merge, rebase, reset, restore, clean, stash, tag, or any other Git write/history-changing command.
- Install or change system-level software.
- Begin implementation merely because the repository is empty.

Work only in:

```text
~/git/tile-meld
```

First confirm the actual working directory and inspect the repository. Treat existing repository contents as the source of truth and preserve useful existing work.

After producing the plan, stop and wait for my approval. I intend to use Opus for planning and then switch the Claude Code model to Sonnet for implementation.

## Product goal

Plan a browser-based multiplayer tile-melding game named **Tile Meld**. The public name may change later, so branding must be easy to replace through centralized configuration rather than scattered hard-coded strings.

The game is inspired by the classic numbered-tile game commonly known as Rummikub, but the application must use original branding, original graphics, original interface design, and original terminology where appropriate. Do not copy official logos, artwork, screenshots, typography, app layouts, or proprietary visual assets.

The first useful release is intended primarily for friends but must support private and public game creation. It is an asynchronous turn-based game similar in pacing to Words With Friends: players do not need to remain online together, may participate in multiple games, and return when notified that it is their turn.

## Confirmed product requirements

### Players, identity, and access

- Support 2-4 players per game.
- Do not require all players to be online simultaneously.
- Initial identity model: a player enters a display name.
- Private games are joined through a short room/invitation code.
- Public games are supported through:
  - A browsable list of open public rooms.
  - Creating a public room and waiting for players.
  - Quick Join into an eligible public room.
- Public-room listings should show enough information to make a useful choice, including current player display names, player count/capacity, and turn-limit setting, while avoiding disclosure of private recovery credentials.
- No spectators.
- A person may participate in multiple asynchronous games at once.
- Duplicate display names may exist globally, but display names must be unique within one room/game.
- Players must be able to reconnect after closing the browser, refreshing, changing devices, or losing connectivity.
- For the accountless first release, use a secure player identity/recovery design based on cryptographically random credentials. A browser may retain a credential locally, and the player may use a recovery link or recovery code on another device.
- Treat possession of a recovery link/code as sensitive because it permits control of that player's seat.
- Never use a transient WebSocket/Socket.IO connection ID as identity.
- Store only securely hashed recovery credentials server-side when technically appropriate; do not log or expose secrets.
- Plan the identity boundary so conventional accounts and Google sign-in can be added later without redesigning the game engine or corrupting existing games.

### Game creation and lobby

- A host creates a game.
- The host selects:
  - 2, 3, or 4 player capacity.
  - Public or private visibility.
  - Turn limit of 4, 8, 12, or 24 continuous hours.
- The default turn limit is 4 hours.
- At least two players are required to start.
- The plan should recommend a clear readiness/start flow and explain whether the host may start with fewer players than the selected capacity.
- Public and private rooms should use the same underlying game model wherever practical.
- The initial audience is friends. Do not add player reporting, blocking, muting, or a moderation dashboard to the MVP.
- Still include basic security controls such as validation, rate limiting, message length limits, output encoding, and abuse-resistant room/token generation.
- Explicitly note the product risk of enabling public chat without moderation, but do not silently remove or disable the confirmed public-room requirement.

### Asynchronous turn timing

- The turn clock starts immediately when the previous turn is committed, forfeited, or otherwise completed, even if the next player is offline.
- The timer runs continuously through nights, weekends, and holidays.
- Give a warning when 15 minutes remain.
- Initial notifications:
  - In-app game and turn indicators.
  - Browser notifications when the player grants permission and the browser supports the required capability.
- Email notifications are deferred until accounts exist.
- The architecture must distinguish ordinary in-page notifications from true background Web Push notifications when the app is closed.
- The plan must recommend a standards-based notification implementation, required service-worker/push-subscription design, fallbacks, and realistic cross-browser limitations.
- Turn deadlines must be stored durably. Do not rely only on an in-memory `setTimeout` or an active client connection.
- The plan must recommend a low-cost, reliable deadline-processing method suitable for an inexpensive cloud deployment. Compare reasonable approaches such as a database-backed job queue, a worker process, scheduled sweeps, and on-read/on-connect catch-up processing.
- Deadline processing must be idempotent and safe if a job runs twice, a server restarts, or two processes race.

### Timeout behavior

When a turn deadline expires:

1. Any uncommitted client-side draft is discarded; it was never canonical game state.
2. The timed-out player forfeits the turn.
3. The server draws up to three random tiles from the pool into that player's rack.
4. If fewer than three tiles remain, draw all remaining tiles.
5. If the pool is empty, draw zero tiles but still forfeit and advance the turn.
6. Record a game event explaining the timeout and penalty.
7. Advance immediately to the next active player and begin that player's deadline.
8. Notify affected players through available in-app/live channels and schedule the next player's turn notification.

### Turn drafting and submission

- The server owns the canonical game state.
- During a turn, the active player manipulates a private local draft of the table and rack.
- Do not save partially arranged turns to the server.
- A refresh, browser closure, device change, disconnect, or timeout discards the local draft and returns the player to the canonical turn-start state.
- The active player can use **Reset Turn** to restore the local draft to the exact canonical state at the start of the turn.
- Other players continue to see the most recently committed table, not the active player's draft.
- Provide both drag-and-drop and click/tap movement controls.
- The client may provide non-authoritative validation hints while the player arranges tiles.
- Only an explicit commit attempt can invoke the invalid-turn penalty; ordinary dragging and local validation warnings do not.
- On **Commit Turn**, the server must validate the entire proposed final arrangement against the canonical turn-start state.
- If valid, commit atomically, persist the new canonical state and game event, check for game end, and advance the turn.
- If invalid, restore/retain the unchanged canonical board, draw up to three penalty tiles for the player, end the turn, record the reason, and advance to the next player.
- The UI must clearly warn that submitting an invalid arrangement causes a three-tile penalty and turn forfeiture.
- Use an optimistic-concurrency mechanism such as game version plus turn ID so stale tabs or duplicate requests cannot overwrite newer state.
- A player may voluntarily choose **Draw Tile** instead of playing:
  - Draw exactly one random tile when one is available.
  - The draw immediately ends the turn.
  - The drawn tile cannot be used until that player's next turn.
  - If the pool is empty, define and document the pass behavior needed for stalemate detection.
- A player may resign.
- In a game with three or four players, remaining players continue while at least two active players remain.
- Remove a resigned player from turn rotation.
- Do not return a resigned player's rack to the pool.
- Their remaining rack value counts against them in final scoring.
- In a two-player game, resignation immediately awards the game to the remaining player.

## Frozen game rules

Treat the following as product requirements even if physical editions or online implementations differ. Create a rigorous rules specification during planning and later implement one pure, server-authoritative game engine against it.

### Tile set

- 106 uniquely identifiable physical tiles.
- Four tile colors.
- Values 1 through 13.
- Two physical copies of each color/value combination: 4 x 13 x 2 = 104 numbered tiles.
- Two jokers.
- Each player begins with 14 randomly shuffled tiles.
- Every physical tile has a unique immutable ID even when another tile has the same visible color and number.
- Recommend a fair digital method for choosing the starting player and document it.

### Valid sets

A valid set contains at least three tiles and is either:

1. **Run**
   - Three or more consecutive numbers of the same color.
   - No duplicate value in one run.
   - A 1 is low only and cannot follow 13.
   - No wraparound.

2. **Group**
   - Three or four tiles of the same number.
   - Every tile in the group has a different color.
   - No repeated color in one group.

### Initial meld

- A player must complete an initial meld before using or rearranging existing table tiles.
- The initial meld may consist of one or more new valid sets.
- Its represented face-value total must be at least 30 points.
- Every tile used in that initial meld must come from the player's own rack.
- A joker contributes the value it represents in its set.
- During the initial-meld turn, the player may not add to, split, combine, or otherwise manipulate sets already on the table.
- Persist whether each player has completed their initial meld.

### Normal play after the initial meld

- The player may create new sets, extend table sets, split sets, combine sets, and rearrange table tiles.
- A committed play must add at least one tile from the active player's rack to the table.
- At the end of the committed turn, every table tile must belong to exactly one valid set.
- No loose tiles may remain.
- A table tile may never be moved into a rack.
- Tiles may not be duplicated, created, lost, replaced by equivalent-looking physical tiles, or stolen from another rack.

### Jokers

- A joker may represent any single tile needed to complete a valid run or group.
- Its represented color/value is determined by its position and the final valid set arrangement.
- A player may not retrieve or manipulate a table joker before completing their initial meld.
- After the initial meld, a joker may be cleared through replacement or rearrangement that leaves all affected table sets valid.
- The replacement tile or tiles needed to keep the table legal may come from the active player's rack or from legal table rearrangement.
- In a three-tile group containing a joker, the joker may be replaced by a tile of either missing color, provided the resulting group remains valid.
- A retrieved joker immediately becomes unrestricted again, but it must be played into a new valid set during the same committed turn.
- A retrieved joker may not be returned to a rack or retained for a later turn.
- The turn that retrieves a joker must still use at least one tile from the active player's rack.
- A joker remaining on a rack at game end is worth a 30-point penalty.
- The plan and later tests must cover ambiguous joker assignments, multiple possible assignments, joker replacement in groups, joker movement between runs/groups, and deterministic validation behavior.

### Winning and scoring

Normal win:

- A player wins when a legal committed turn leaves their rack empty.
- Each losing player receives a negative score equal to the face-value total remaining on their rack, with each joker worth 30.
- The winner receives a positive score equal to the combined absolute value of the losing players' scores.

Pool exhausted / no more plays:

- If the pool is empty, play continues until the engine determines that no active player can make a legal play under the chosen stalemate-detection policy.
- The active player with the lowest rack total wins.
- For scoring, subtract the winner's rack total from each other active player's rack total. Each other player receives the negative of that difference, and the winner receives the positive sum of those differences.
- The plan must define deterministic tie behavior for equal lowest rack totals and recommend the least surprising rule before implementation.

Resignation:

- A resigned player's rack remains attributable to that player and counts against them in final scoring.
- The plan must define how resignation interacts with the winner's positive score and with later pool-exhaustion scoring.

Match history:

- Preserve completed game results.
- Support a rematch with the same room participants when practical.
- Maintain a running/cumulative score across games in the same room or match series.
- Do not implement lifetime statistics, rankings, or leaderboards until accounts exist.

## Chat

- Include text chat scoped to a specific game.
- Chat remains available for the life of that game.
- Do not implement mute, report, block, or moderation controls in the MVP.
- Validate, sanitize/output-encode, and length-limit chat messages.
- Prevent client-supplied timestamps, sender IDs, or display names from being trusted.
- Plan reasonable message retention and cleanup when completed/abandoned games are eventually deleted.

## User experience and visual direction

- Support current major desktop and mobile browsers, including Chrome, Edge, Firefox, and Safari, subject to documented capability differences.
- Responsive layouts should support desktop, laptop, tablet, and phone screens.
- The game should visually evoke a physical tabletop without copying a commercial application's appearance.
- The table should use structured set/meld containers rather than an unconstrained coordinate canvas unless the plan presents a compelling alternative.
- Provide both drag-and-drop and click/tap interactions.
- Support touch input and accessible keyboard operation.
- The rack supports:
  - Manual arrangement.
  - Sort by number.
  - Sort by color.
- Provide controls such as Undo, Reset Turn, Draw Tile, and Commit Turn as appropriate.
- Make turn ownership, deadline, pool count, connection state, player rack counts, penalties, validation errors, and game status understandable.
- Use an original accessible color palette. Do not rely on color alone: include a secondary identifier such as a symbol, pattern, or letter on each tile color.
- Use centralized design tokens and product metadata so the Tile Meld name, palette, and theme can be replaced later.
- Plan accessibility goals, including focus states, keyboard navigation, semantic labels, contrast, reduced motion, and screen-reader announcements for important game events.

## Persistence and server authority

The game is asynchronous and must survive browser closure and server restart.

Plan persistence for at least:

- Rooms and visibility/settings.
- Public-lobby eligibility.
- Players, seats, active/resigned status, and identity/recovery credential hashes.
- Canonical tile pool/order or equivalent deterministic state.
- Private racks.
- Table sets and physical tile IDs.
- Initial-meld completion per player.
- Current turn ID, active player, deadline, version, and status.
- Completed game results and cumulative room/match scores.
- Game-scoped chat.
- Notification subscriptions/preferences.
- An append-only or auditable game-event history adequate for debugging disputed turns without leaking hidden rack contents to unauthorized clients.

The server is authoritative for:

- Tile ownership.
- Shuffling and random draws.
- Legal-set and legal-turn validation.
- Timeout and invalid-submission penalties.
- Turn order and deadlines.
- Resignation.
- Winning and scoring.
- Redacted views sent to each player.

A client must never receive another player's rack contents or private recovery credentials. Opponents may see only permitted public information such as rack tile counts.

Use atomic database transactions and idempotency/concurrency controls so canonical state, turn advancement, penalties, and event records cannot diverge.

## Technical direction to evaluate

Evaluate and either confirm or improve this proposed stack:

- One Git repository containing frontend, backend, shared packages, tests, documentation, migrations, and deployment configuration.
- TypeScript throughout.
- React frontend.
- Node.js backend.
- A pure shared TypeScript game-rules/state-transition package with no React, database, transport, or framework dependencies.
- HTTP for ordinary resource operations and WebSocket/Socket.IO or an equivalent maintained mechanism for live state updates and chat.
- PostgreSQL for durable asynchronous games.
- A durable deadline/job approach compatible with PostgreSQL and inexpensive hosting.
- Vitest or an equivalent TypeScript unit/integration test framework.
- Playwright for end-to-end and multiple-browser-context testing.
- Docker support from the beginning while preserving a straightforward non-Docker local workflow on Linux Mint.
- GitHub Actions for formatting checks, linting, type checking, unit/integration tests, and later end-to-end tests as practical.

Do not accept the proposed stack blindly. Recommend changes when they materially improve correctness, operational simplicity, browser support, cost, or maintainability. Explain each change and its tradeoffs.

Prefer a modular monolith or similarly simple deployable architecture. Avoid premature microservices, Kubernetes, complex event sourcing, or distributed infrastructure unless a requirement truly demands it.

The first deployed version will use an inexpensive cloud host. The plan must:

- Describe the minimum production topology.
- Identify whether the app needs one web process plus one worker process, or whether a simpler reliable topology is possible.
- Compare at least two realistic low-cost hosting approaches without assuming a free tier will remain available.
- Account for PostgreSQL, persistent background deadlines, Web Push, TLS, environment variables, backups, logs, health checks, migrations, and restart behavior.
- Separate provider-neutral architecture from optional provider-specific deployment instructions.

## Security and privacy planning

Address at least:

- Server-side schema validation for every HTTP and socket input.
- Authentication of player recovery credentials.
- Authorization for every game action.
- Secure room-code and token generation.
- Credential hashing and comparison.
- Replay, stale-tab, duplicate-submit, and race protection.
- Rate limiting for room creation, public lobby queries, joins, recovery attempts, chat, and game actions.
- CORS, secure headers, TLS assumptions, cookie/local-storage tradeoffs, CSRF considerations, and XSS prevention.
- Safe logging that does not expose racks, tokens, recovery links, push credentials, or secrets.
- Database transactions and least-privilege database access.
- Secret management and `.env.example` expectations for implementation.
- Dependency and container scanning appropriate for GitHub Actions.
- Data-retention recommendations for abandoned rooms, completed games, chat, event logs, and push subscriptions.
- Recovery-link revocation or rotation design.
- Explicit risks created by public rooms and unmoderated chat.

## Required test-planning depth

Testing is part of the architecture, not a later add-on. Produce a test matrix covering at least:

### Pure game-engine tests

- Valid and invalid runs.
- Valid and invalid groups.
- Duplicate physical tiles versus duplicate visible values.
- No 13-to-1 wrap.
- Initial meld below, exactly at, and above 30.
- Initial meld using only rack tiles.
- Prohibition on table manipulation before/during initial meld.
- Joker values in the initial meld.
- Joker retrieval/replacement/reuse edge cases.
- Multiple valid joker assignments and deterministic handling.
- Complex splitting, combining, and rearrangement.
- Requirement to use at least one rack tile on a committed play.
- No tile creation, loss, duplication, or transfer to the wrong rack.
- Voluntary draw and next-turn restriction.
- Invalid-commit three-tile penalty.
- Timeout three-tile penalty.
- Pools containing 0, 1, or 2 tiles when a three-tile penalty occurs.
- Resignation in 2-, 3-, and 4-player games.
- Normal scoring, joker scoring, pool-exhaustion scoring, and tie cases.
- Stalemate detection.

### Server/integration tests

- Room creation, private joins, public listing, and Quick Join.
- Unique display names within a room.
- Secure reconnect/recovery and cross-device recovery.
- Authorization and rack redaction.
- Multiple simultaneous games for one player identity.
- Turn-start, commit, draw, penalty, timeout, resign, win, and rematch transactions.
- Duplicate event/idempotency handling.
- Stale version/turn rejection.
- Server restart and deadline catch-up.
- Simulated scheduler races.
- Chat persistence and authorization.
- Push subscription lifecycle and notification scheduling.

### End-to-end tests

- Two to four isolated browser contexts acting as separate players.
- Private-room and public-room flows.
- Desktop and mobile viewport interaction.
- Drag/drop and click/tap alternatives.
- Refresh/reconnect and recovery on another context.
- Timer warning and timeout using controllable clocks rather than real four-hour waits.
- Invalid submit penalty.
- Complete playable game or a deterministic shortened fixture that exercises the full lifecycle.
- Accessibility checks where practical.

## Version control and implementation workflow for the later Sonnet phase

The repository is for version control, not content management.

When I approve the plan and switch to Sonnet:

- Claude may create and modify project files and install project-level dependencies inside `~/git/tile-meld`.
- Claude must not install system-level Linux packages without asking first.
- Claude must never run Git write/history-changing commands, including add, commit, push, pull, branch creation, checkout/switch, merge, rebase, reset, restore, clean, stash, or tag.
- Claude may use read-only Git commands to inspect status and diffs.
- Implement one approved phase at a time.
- Run the relevant tests and verification for that phase.
- Stop after each major phase for my review.
- At every stop, explicitly notify me that it is time for a manual Git checkpoint.
- Provide single-line commands, rooted at `~/git/tile-meld`, for me to inspect the changes and then commit/push them myself.
- Do not assume a checkpoint was completed until I confirm it.
- Do not continue automatically into the next phase.

The plan should define practical checkpoint boundaries and, for each phase, state:

- Files/components expected to change.
- Acceptance criteria.
- Tests to run.
- Risks.
- A suggested commit message.
- The exact manual Git inspection/checkpoint commands Claude should show me after implementation.

## Explicit MVP exclusions

Do not include these in the first release unless the plan demonstrates that one is technically unavoidable:

- AI/computer opponents.
- Spectators.
- Native iOS or Android apps.
- Payments, subscriptions, advertising, or virtual currency.
- Rankings, global leaderboards, or lifetime statistics.
- Social-media features.
- Email notifications.
- Google sign-in or full accounts.
- Mute, report, block, or moderation dashboards.
- Tournament systems.
- Voice/video chat.
- Multiple visual themes beyond a well-structured default theme.
- Horizontal scaling or Kubernetes.

The architecture should leave reasonable seams for later accounts/Google sign-in and computer opponents, but do not build speculative systems for them now.

## Planning deliverables

After inspecting the repository, provide one coherent plan with these sections:

1. **Repository assessment**
   - Current contents, technologies, useful existing work, gaps, and constraints.
   - Confirm that you made no file changes.

2. **Requirements restatement**
   - Concise description of the intended product and its MVP boundary.
   - Identify contradictions, hidden assumptions, and any decisions still required.

3. **Rules specification and edge-case register**
   - Formalize the frozen rules.
   - Enumerate ambiguous or difficult cases.
   - Recommend explicit decisions for unresolved ties, stalemate detection, resign scoring, empty-pool draws, lobby capacity/start behavior, and abandoned-game retention.

4. **Architecture recommendation**
   - Component diagram in text or Mermaid.
   - Responsibilities and dependency boundaries.
   - Why the game engine remains pure and server-authoritative.
   - Confirm or revise the proposed stack with tradeoffs.

5. **Domain and state model**
   - Room, match/game, player/seat, tile, rack, table set, turn, deadline, chat, notification, recovery identity, score, and event concepts.
   - Room, game, player, and turn state machines.
   - Invariants that must always hold.

6. **Data model**
   - Proposed PostgreSQL tables/entities, key fields, relationships, indexes, uniqueness constraints, and transaction boundaries.
   - Explain how hidden rack data and credential hashes remain protected.
   - Recommend retention/cleanup policy.

7. **API and real-time contract**
   - HTTP endpoints and socket events at planning level.
   - Request/response/event schemas.
   - Per-player redaction model.
   - Idempotency and optimistic-concurrency strategy.

8. **Turn deadline and notification design**
   - Durable scheduling choice and alternatives.
   - Exact timeout transaction.
   - 15-minute warning behavior.
   - Web Push/in-app notification design and browser fallback.
   - Restart, duplicate-job, and race recovery.

9. **Security and privacy design**
   - Threat model and mitigations appropriate to this friends-first but public-capable game.
   - Recovery-link security and future migration to accounts/Google sign-in.

10. **UX and screen plan**
    - Home/dashboard, game list, create/join, public lobby, waiting room, tabletop, chat, game-over/rematch, recovery, and error states.
    - Desktop/mobile behavior and accessible tile interactions.

11. **Testing strategy**
    - Unit, property/invariant, integration, scheduler, end-to-end, accessibility, and CI coverage.
    - Identify the highest-risk rules that should be test-driven first.

12. **Deployment recommendation**
    - Local Linux Mint workflow with and without Docker.
    - Production topology.
    - At least two inexpensive hosting approaches and tradeoffs.
    - Migration, backup, observability, health-check, and rollback considerations.

13. **Phased implementation plan for Sonnet**
    - Small, ordered phases with clear acceptance criteria and dependencies.
    - Tests and verification per phase.
    - Manual Git checkpoint after every major phase.
    - Avoid an oversized first coding phase.

14. **Risk register and deferred roadmap**
    - Technical, rules, UX, public-chat, notification, hosting-cost, and security risks.
    - Later accounts/Google sign-in, optional AI players, moderation, and other post-MVP capabilities.

15. **Sonnet handoff**
    - A concise checklist telling Sonnet exactly where to begin after I approve the plan.
    - Do not begin that work now.

## Final instruction

Inspect `~/git/tile-meld`, produce the complete planning deliverable in the conversation, explicitly state whether the working tree was changed, and stop. Do not create or modify files and do not implement any feature until I approve the plan and switch to Sonnet.
