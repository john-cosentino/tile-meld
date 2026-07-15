import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Kysely } from "kysely";
import type { Database } from "./db/types.js";
import type { Env } from "./env.js";
import type { AppInstance } from "./http/types.js";
import { registerHealthRoutes } from "./http/routes/health.js";
import { registerIdentityRoutes } from "./http/routes/identity.js";
import { registerRoomRoutes } from "./http/routes/rooms.js";
import { registerGameRoutes } from "./http/routes/games.js";
import { registerChatRoutes } from "./http/routes/chat.js";
import { registerPushRoutes } from "./http/routes/push.js";
import { attachRealtimeGateway } from "./realtime/gateway.js";

export type BuildAppOptions = {
  readonly db: Kysely<Database>;
  readonly env: Env;
  readonly logger?: boolean;
};

// Fastify's default request/response serializers don't include headers,
// cookies, or bodies in the log line at all (just method/url/hostname/
// remoteAddress/remotePort, and statusCode/responseTime) -- nothing here
// is patching an active leak. This is deliberate defense-in-depth (plan
// §12.4: "structured JSON logs, secret-redacted") against a *future*
// change that starts logging more of the request (a custom serializer, a
// debug log of `request.headers` or `request.body` while chasing a bug)
// silently starting to leak the session cookie or a recovery secret into
// production logs. Redact paths are checked against the object being
// logged, not the raw request -- if a field never appears there in the
// first place, the corresponding path is simply a no-op, not dead
// configuration.
const REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  "req.body.recoverySecret",
  "res.body.recoverySecret",
];

export async function buildApp(options: BuildAppOptions): Promise<AppInstance> {
  const loggerOption = options.logger ?? true;
  const app = Fastify({
    logger: loggerOption ? { redact: { paths: REDACT_PATHS, censor: "[REDACTED]" } } : false,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate("db", options.db);
  app.decorate("env", options.env);

  await app.register(helmet);
  await app.register(cors, {
    origin: options.env.CORS_ORIGIN ?? false,
    credentials: true,
  });
  await app.register(cookie);
  // No global limit -- each route class gets its own config (see
  // http/rateLimits.ts), matching docs/opus-implementation-plan.md §9.2
  // ("Rate limiting for room creation, public lobby queries, joins,
  // recovery attempts (strict), chat, and game actions").
  //
  // MUST be awaited before any route that uses `config.rateLimit` is
  // declared: the plugin wires per-route limits via an internal
  // `onRoute` hook, which only intercepts routes registered *after* the
  // hook is attached. Registering this plugin without awaiting it (the
  // usual fire-and-forget Fastify pattern) silently no-ops every
  // per-route rate limit below -- no error, it just never triggers.
  // Found by deliberately hammering a rate-limited route in a test and
  // getting zero 429s; confirmed via a minimal repro before fixing here.
  await app.register(rateLimit, { global: false });

  registerHealthRoutes(app);
  registerIdentityRoutes(app);
  registerRoomRoutes(app);
  registerGameRoutes(app);
  registerChatRoutes(app);
  registerPushRoutes(app);

  // Serves the built web SPA from the same origin as the API (plan
  // §12.2's minimum production topology: "one web container"). Resolved
  // relative to this module's own location so it works identically
  // whether running from source (tsx, dev) or from the bundled
  // dist/index.js -- esbuild's output sits at the same depth under
  // apps/server/ as src/ does, so this relative path lands in the same
  // place either way (the same reasoning as the migrations folder in
  // db/migrator.ts). Optional: running the API alone -- paired with
  // Vite's own dev server locally, or in this app's own test suite --
  // still works when apps/web hasn't been built.
  const webDistDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (existsSync(webDistDir)) {
    await app.register(fastifyStatic, { root: webDistDir });
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== "GET" || request.url.startsWith("/api/")) {
        reply.code(404).send({ error: "not_found", message: "no such route" });
        return;
      }
      // Every client-side route (React Router's BrowserRouter) serves the
      // same index.html; the app's own router takes it from there. Real
      // asset requests (e.g. /assets/index-abc123.js) that don't exist
      // are legitimately errors, not client routes -- but @fastify/static
      // already served every file that DOES exist above, before the
      // request ever reaches this handler, so anything landing here
      // that merely *looks* like an asset path (has a file extension) is
      // itself a genuine 404, not a route to fall back for.
      if (path.extname(request.url) !== "") {
        reply.code(404).send({ error: "not_found", message: "no such asset" });
        return;
      }
      reply.sendFile("index.html");
    });
  } else {
    app.log.info(`no built web app found at ${webDistDir} -- serving API only`);
  }

  // Attaches to the same underlying http.Server Fastify owns -- Socket.IO
  // doesn't need the server to be listening yet, just constructed, so this
  // can happen here alongside route registration rather than in index.ts.
  const io = attachRealtimeGateway(app);
  app.decorate("io", io);
  app.addHook("onClose", async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  return app;
}
