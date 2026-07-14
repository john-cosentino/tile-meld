// Phase 0 placeholder. Fastify + Socket.IO + persistence are wired up
// starting in Phase 3/4/5 -- see docs/opus-implementation-plan.md §4.2,
// Phases 3-5. This entry point exists to prove the monorepo wiring
// (workspace-linked package imports) resolves correctly end to end.

import { ping as pingEngine } from "@tile-meld/engine";
import { ping as pingShared } from "@tile-meld/shared";

export function bootMessage(): string {
  return `tile-meld server placeholder (${pingEngine()}, ${pingShared()})`;
}

// Only run when executed directly (not when imported by tests).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  console.log(bootMessage());
}
