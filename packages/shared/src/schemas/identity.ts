import { z } from "zod";

export const CreateIdentityResponseSchema = z.object({
  playerId: z.string(),
  recoverySecret: z.string(),
});

export const RecoverSessionRequestSchema = z.object({
  playerId: z.string(),
  recoverySecret: z.string(),
});

export const RecoverSessionResponseSchema = z.object({
  playerId: z.string(),
});

export const RotateRecoveryResponseSchema = z.object({
  recoverySecret: z.string(),
});

export type CreateIdentityResponse = z.infer<typeof CreateIdentityResponseSchema>;
export type RecoverSessionRequest = z.infer<typeof RecoverSessionRequestSchema>;
export type RecoverSessionResponse = z.infer<typeof RecoverSessionResponseSchema>;
export type RotateRecoveryResponse = z.infer<typeof RotateRecoveryResponseSchema>;
