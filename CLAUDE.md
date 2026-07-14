# Tile Meld — working rules for Claude

This file is **guidance for the model, not a hard control**. It cannot stop a
misbehaving tool call by itself — the enforceable guard is the Git-permission
allowlist plus (recommended) a PreToolUse hook in `.claude/settings.local.json`
(see `docs/opus-implementation-plan.md` §1.6, Decision D-GITGUARD). Treat this
file as a reminder of the agreed workflow, not as the mechanism that enforces it.

## Authoritative plan

`docs/opus-implementation-plan.md` is the approved implementation plan.
Treat it as the source of truth for architecture, data model, rules, and the
phased delivery order. Do not deviate from a confirmed Decision (Appendix A)
without asking first.

## Non-negotiable rules

- **Never run a Git write/history command** — no `add`, `commit`, `push`,
  `pull`, `merge`, `rebase`, `reset`, `restore`, `clean`, `stash`, `tag`,
  `checkout`, `switch`, or `branch`. Read-only Git inspection
  (`status`, `diff`, `log`) is fine.
- **Ask before any system-level install** (apt packages, Docker, database
  engines, global system config). Project-level dependencies inside this repo
  (via `pnpm install`) do not require asking.
- **Implement one phase at a time** (see plan §13). Do not start the next
  phase until the user has confirmed the manual Git checkpoint for the
  current one.
- **Stop at every phase checkpoint** and print the exact single-line
  inspect/commit/push commands, rooted at `~/git/tile-meld`, for the user to
  run themselves.
- **Keep `packages/engine` pure** — no React, DB, network, `Date.now()`, or
  `Math.random()`. Time and randomness are always injected. The server is
  authoritative; the client's copy of the engine is hints only, never a
  source of truth.
- **Never leak hidden state** — a redacted view sent to any client must never
  contain another seat's rack contents, recovery credential hashes, or
  session tokens.

## Toolchain

Node.js 24 LTS + pnpm 11, pinned via `.nvmrc`/`.node-version` and the root
`package.json` `engines`/`packageManager` fields. Do not target or reintroduce
Node 20 (end-of-life).
