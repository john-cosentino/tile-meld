import type { FastifyReply } from "fastify";

export const SESSION_COOKIE_NAME = "tilemeld_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days idle expiry

/** The single session-cookie writer (httpOnly + SameSite=Lax per plan
 * §9.2), shared by the identity and account route modules. */
export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
}
