import { z } from "zod";

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
  CORS_ORIGIN: z.string().optional(),
  // Web Push is a progressive enhancement (§8.4: "never rely on push for
  // correctness") -- all three are optional, and push sending is simply
  // disabled (not an error) when any is missing. Generate a keypair with
  // `npx web-push generate-vapid-keys`.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
