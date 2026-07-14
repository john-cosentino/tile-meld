import { buildApp } from "./app.js";
import { createDb } from "./db/connection.js";
import { loadEnv } from "./env.js";
import { startBackgroundSweeps } from "./game/deadlineSweep.js";
import { broadcastTurnActionResult, broadcastWarning } from "./realtime/gateway.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const app = await buildApp({ db, env });

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`tile-meld server listening on port ${env.PORT}`);
    // The embedded deadline scheduler (docs/opus-implementation-plan.md
    // §8.1/§8.2) -- deliberately started only here, once the server is
    // actually serving, not inside buildApp itself, so test suites that
    // build an app for HTTP/socket testing never get a stray background
    // interval running underneath them.
    startBackgroundSweeps(app, {
      onTimeout: (settled) => broadcastTurnActionResult(app.io, settled.gameId, settled.result),
      onWarning: (warned) => broadcastWarning(app.io, warned),
    });
  })
  .catch((err: unknown) => {
    app.log.error(err);
    process.exit(1);
  });
