import "fastify";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Database } from "../db/types.js";
import type { Env } from "../env.js";
import type { RealtimeServer } from "../realtime/types.js";

export type AuthenticatedPlayer = { readonly id: string };

declare module "fastify" {
  interface FastifyInstance {
    db: Kysely<Database>;
    env: Env;
    io: RealtimeServer;
  }
  interface FastifyRequest {
    player?: AuthenticatedPlayer;
  }
}

// Shared type for the app instance across route-registration modules --
// carries the Zod type provider so route schemas get full type inference.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppInstance = FastifyInstance<any, any, any, FastifyBaseLogger, ZodTypeProvider>;
