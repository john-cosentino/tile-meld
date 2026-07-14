import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
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
import { attachRealtimeGateway } from "./realtime/gateway.js";

export type BuildAppOptions = {
  readonly db: Kysely<Database>;
  readonly env: Env;
  readonly logger?: boolean;
};

export async function buildApp(options: BuildAppOptions): Promise<AppInstance> {
  const app = Fastify({ logger: options.logger ?? true }).withTypeProvider<ZodTypeProvider>();

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
