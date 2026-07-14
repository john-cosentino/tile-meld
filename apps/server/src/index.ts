// Phase 0/1 placeholder. Fastify + Socket.IO + persistence are wired up
// starting in Phase 3/4/5 -- see docs/opus-implementation-plan.md §4.2,
// Phases 3-5. This entry point exists to prove the monorepo wiring
// (workspace-linked package imports) resolves correctly end to end, now
// exercising real Phase 1 engine content instead of a placeholder.

import { createTileCatalog } from "@tile-meld/engine";
import { ping as pingShared } from "@tile-meld/shared";

export function bootMessage(): string {
  const catalogSize = createTileCatalog().length;
  return `tile-meld server placeholder (engine catalog: ${catalogSize} tiles, ${pingShared()})`;
}

// Only run when executed directly (not when imported by tests).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  console.log(bootMessage());
}
