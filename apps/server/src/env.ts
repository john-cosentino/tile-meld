import { z } from "zod";

/** Default computer-opponent action delay when BOT_TURN_DELAY_MS is unset.
 * Applied at read sites (not as a schema default) so the field stays optional
 * in the Env type and existing test env objects need not specify it. */
export const DEFAULT_BOT_TURN_DELAY_MS = 1000;

// A container/PaaS environment (Docker Compose's `${VAR:-}` in particular
// -- see docker-compose.prod.yml) commonly sets an *unset* optional var to
// an empty string rather than truly omitting the key. `z.string().optional()`
// alone treats that empty string as a present, valid value -- found the
// hard way when CORS_ORIGIN="" reached @fastify/cors as `origin: ""`,
// which the plugin rejects outright ("Invalid CORS origin option"),
// instead of being treated the same as CORS_ORIGIN being absent. Every
// optional string env var should mean "undefined or a real value," never
// "empty string," for whatever reads it downstream.
const optionalString = () =>
  z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value));

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required -- see .env.example"),
  SESSION_TOKEN_HMAC_SECRET: z
    .string()
    .min(
      32,
      "SESSION_TOKEN_HMAC_SECRET must be at least 32 characters -- generate with: openssl rand -hex 32",
    ),
  CORS_ORIGIN: optionalString(),
  // Web Push is a progressive enhancement (§8.4: "never rely on push for
  // correctness") -- all three are optional, and push sending is simply
  // disabled (not an error) when any is missing. Generate a keypair with
  // `npx web-push generate-vapid-keys`.
  VAPID_PUBLIC_KEY: optionalString(),
  VAPID_PRIVATE_KEY: optionalString(),
  VAPID_SUBJECT: optionalString(),
  // How long the computer opponent waits, after a turn is handed to it,
  // before acting (docs plan §7). Purely a UX latency knob: the human sees
  // their turn complete and the UI transition to "Computer is playing" before
  // the bot moves. It is NOT a correctness mechanism -- durable recovery does
  // not depend on it. Also used as the recovery sweep's "due" threshold so a
  // fast-path scheduled turn gets first chance before the sweep. Defaults to
  // ~1s (DEFAULT_BOT_TURN_DELAY_MS, applied at read sites); set to 0 for
  // instant execution in tests. Optional (not schema-defaulted) so it stays
  // absent-able in the Env type.
  BOT_TURN_DELAY_MS: z.coerce.number().int().min(0).max(60_000).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
