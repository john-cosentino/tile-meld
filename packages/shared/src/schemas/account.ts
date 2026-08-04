import { z } from "zod";
import { UsernameSchema } from "./identity.js";

// User accounts (accounts plan, Phase B): username+password sign-in, email
// used ONLY to deliver password-reset links (deliberately non-unique and
// never looked up by -- reset requests are keyed by username), and a
// picked profile portrait. The server re-validates everything; these
// schemas exist for route validation and client-side early feedback.

/** Min 8 / max 128, no composition rules -- length is the only requirement
 * the server enforces (argon2id does the rest). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const EmailSchema = z.string().trim().toLowerCase().email().max(254);

/** Size of the selectable portrait roster (apps/web's PORTRAIT_ROSTER must
 * match -- cross-checked by a web unit test). The database only enforces
 * portrait_id >= 0; this constant is the real upper bound so growing the
 * roster is a code change, not a migration -- as with the 2026-08-04
 * expansion from 8 to 12. Append-only: persisted ids index the roster. */
export const PORTRAIT_COUNT = 12;

export const PortraitIdSchema = z
  .number()
  .int()
  .min(0)
  .max(PORTRAIT_COUNT - 1)
  .nullable();

export const RegisterRequestSchema = z.object({
  username: UsernameSchema,
  email: EmailSchema,
  password: PasswordSchema,
});

export const LoginRequestSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

/** Session-establishing responses (register/login/reset-confirm). */
export const AuthSessionResponseSchema = z.object({
  playerId: z.string(),
  username: z.string().nullable(),
  portraitId: PortraitIdSchema,
});

export const MeResponseSchema = z.object({
  playerId: z.string(),
  username: z.string().nullable(),
  email: z.string().nullable(),
  portraitId: PortraitIdSchema,
  /** false only for a legacy recovery-code identity that has not yet set a
   * password -- the client's finish-setup gate keys off this. */
  hasPassword: z.boolean(),
});

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: PasswordSchema,
});

export const ResetRequestRequestSchema = z.object({
  username: z.string().trim().min(1),
});

/** Always {ok:true} -- the response must never reveal whether the account
 * exists or has an email on file. */
export const ResetRequestResponseSchema = z.object({ ok: z.literal(true) });

export const ResetConfirmRequestSchema = z.object({
  token: z.string().min(1),
  newPassword: PasswordSchema,
});

export const UpgradeAccountRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});

export const SetPortraitRequestSchema = z.object({
  portraitId: PortraitIdSchema,
});

export const ConfigResponseSchema = z.object({
  accountsRequired: z.boolean(),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export type ResetRequestRequest = z.infer<typeof ResetRequestRequestSchema>;
export type ResetConfirmRequest = z.infer<typeof ResetConfirmRequestSchema>;
export type UpgradeAccountRequest = z.infer<typeof UpgradeAccountRequestSchema>;
export type SetPortraitRequest = z.infer<typeof SetPortraitRequestSchema>;
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>;
