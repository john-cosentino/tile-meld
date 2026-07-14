import { hash, verify } from "@node-rs/argon2";
import { createHmac, randomBytes } from "node:crypto";

/** Long-term recovery secret hashing. Argon2id (memory-hard, deliberately
 * slow) -- never used for anything requiring indexed/deterministic lookup.
 * See docs/opus-implementation-plan.md D-IDENTITY. */
export async function hashRecoverySecret(secret: string): Promise<string> {
  return hash(secret);
}

export async function verifyRecoverySecret(hashValue: string, secret: string): Promise<boolean> {
  return verify(hashValue, secret);
}

export function generateRecoverySecret(): string {
  return randomBytes(32).toString("base64url");
}

/** Session tokens: deterministic keyed HMAC-SHA256, so `sessions.token_hash`
 * can be looked up by an index -- Argon2id's deliberate slowness and
 * per-call random salt make it unsuitable for this. The HMAC key
 * (`SESSION_TOKEN_HMAC_SECRET`) is what makes this unforgeable without
 * server access, not secrecy of the algorithm. */
export function hashSessionToken(token: string, hmacSecret: string): string {
  return createHmac("sha256", hmacSecret).update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I
const ROOM_CODE_LENGTH = 8;

/** CSPRNG room code over an unambiguous alphabet -- see
 * docs/opus-implementation-plan.md §9.2. */
export function generateRoomCode(): string {
  const bytes = randomBytes(ROOM_CODE_LENGTH);
  let code = "";
  for (const byte of bytes) {
    code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
  }
  return code;
}
