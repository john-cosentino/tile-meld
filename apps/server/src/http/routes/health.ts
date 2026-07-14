import { sql } from "kysely";
import type { AppInstance } from "../types.js";

export function registerHealthRoutes(app: AppInstance): void {
  app.get("/api/health", async (_request, reply) => {
    try {
      await sql`SELECT 1`.execute(app.db);
      return reply.code(200).send({ ok: true });
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });
}
