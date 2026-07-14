import type { FastifyReply } from "fastify";

export type ErrorCode =
  "unauthorized" | "forbidden" | "not_found" | "conflict" | "invalid_request" | "rate_limited";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid_request: 400,
  rate_limited: 429,
};

/** A single, consistent shape for every error response -- callers never
 * see a raw DB or framework error leak through. */
export function sendError(reply: FastifyReply, code: ErrorCode, message: string): FastifyReply {
  return reply.code(STATUS_BY_CODE[code]).send({ error: code, message });
}
