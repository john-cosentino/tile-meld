import { buildApp } from "./app.js";
import { createDb } from "./db/connection.js";
import { loadEnv } from "./env.js";
import { startBackgroundSweeps } from "./game/deadlineSweep.js";
import { broadcastTurnActionResult, broadcastWarning } from "./realtime/gateway.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const app = await buildApp({ db, env });

let stopSweeps: (() => void) | undefined;

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`tile-meld server listening on port ${env.PORT}`);
    // The embedded deadline scheduler (docs/opus-implementation-plan.md
    // §8.1/§8.2) -- deliberately started only here, once the server is
    // actually serving, not inside buildApp itself, so test suites that
    // build an app for HTTP/socket testing never get a stray background
    // interval running underneath them.
    stopSweeps = startBackgroundSweeps(app, {
      onTimeout: (settled) =>
        broadcastTurnActionResult(app, app.io, settled.gameId, settled.result),
      onWarning: (warned) => broadcastWarning(app, app.io, warned),
    });
  })
  .catch((err: unknown) => {
    app.log.error(err);
    process.exit(1);
  });

// Graceful shutdown (plan §12.2/§12.4): a deploy sends SIGTERM before
// killing the old instance, and a mid-turn player shouldn't see a dropped
// connection turn into a lost commit. Stopping the sweep first means no
// *new* timeout settlement starts during drain; app.close() (via the
// onClose hook in app.ts) closes Socket.IO's listener so no new socket
// connections are accepted while in-flight requests finish; closing the DB
// pool last means every in-flight query still gets to complete against it.
// Nothing here is unique to any host -- Render, a VPS, and plain `docker
// stop` all send SIGTERM the same way. The forced-exit timeout is a
// backstop in case something hangs (a stuck query, a socket that never
// drains) -- shutting down late is still better than never shutting down,
// but an orchestrator's own SIGKILL grace period is usually short enough
// that hanging past it would be killed uncleanly anyway.
let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`received ${signal}, shutting down gracefully`);

  const forceExit = setTimeout(() => {
    app.log.error("graceful shutdown timed out after 10s, forcing exit");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    stopSweeps?.();
    await app.close();
    await db.destroy();
    app.log.info("shutdown complete");
    process.exit(0);
  } catch (err) {
    app.log.error(err, "error during shutdown");
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
