import { z } from "zod";

export const CreateIdentityResponseSchema = z.object({
  playerId: z.string(),
  recoverySecret: z.string(),
  username: z.string().nullable(),
});

export const RecoverSessionRequestSchema = z.object({
  playerId: z.string(),
  recoverySecret: z.string(),
});

export const RecoverSessionResponseSchema = z.object({
  playerId: z.string(),
  username: z.string().nullable(),
});

export const RotateRecoveryResponseSchema = z.object({
  recoverySecret: z.string(),
});

// Global human-username identity (Phase 1: docs/next-changes-implementation-
// plan.md). This schema is shared so the client can give useful early
// feedback, but the server re-validates every rule, and the database's
// partial unique index (players_username_canonical_human_uk, migration
// 0019) is the final arbiter of uniqueness -- never this schema.
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;

export const UsernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters`)
  .max(USERNAME_MAX_LENGTH, `Username must be at most ${USERNAME_MAX_LENGTH} characters`)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "Username may only contain letters, numbers, underscores, and hyphens (no spaces)",
  );

// System-reserved names, checked against the lowercase canonical form.
// "public_" is reserved because that prefix is planned to identify
// auto-generated public room names derived from a creator's username.
const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "computer",
  "system",
  "admin",
  "moderator",
  "null",
  "undefined",
]);
const RESERVED_USERNAME_PREFIXES: readonly string[] = ["public_"];

/** Lowercase canonical form used for uniqueness. Deliberately simple --
 * `trim` + `toLowerCase` -- usernames are restricted to ASCII (see
 * UsernameSchema), so no Unicode casefold/normalization infrastructure is
 * needed while that restriction holds. */
export function canonicalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Expects the canonical (trimmed, lowercase) form -- call
 * canonicalizeUsername() first. */
export function isReservedUsername(canonicalUsername: string): boolean {
  return (
    RESERVED_USERNAMES.has(canonicalUsername) ||
    RESERVED_USERNAME_PREFIXES.some((prefix) => canonicalUsername.startsWith(prefix))
  );
}

export const ClaimUsernameRequestSchema = z.object({
  username: UsernameSchema,
});

export const ClaimUsernameResponseSchema = z.object({
  username: z.string(),
});

export type CreateIdentityResponse = z.infer<typeof CreateIdentityResponseSchema>;
export type RecoverSessionRequest = z.infer<typeof RecoverSessionRequestSchema>;
export type RecoverSessionResponse = z.infer<typeof RecoverSessionResponseSchema>;
export type RotateRecoveryResponse = z.infer<typeof RotateRecoveryResponseSchema>;
export type ClaimUsernameRequest = z.infer<typeof ClaimUsernameRequestSchema>;
export type ClaimUsernameResponse = z.infer<typeof ClaimUsernameResponseSchema>;
