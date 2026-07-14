import { createDb, requireDatabaseUrl } from "./connection.js";
import { migrateDown, migrateToLatest } from "./migrator.js";

const direction = process.argv[2];
if (direction !== "up" && direction !== "down") {
  console.error("Usage: tsx src/db/migrate-cli.ts <up|down>");
  process.exit(1);
}

const db = createDb(requireDatabaseUrl());

const result = direction === "up" ? await migrateToLatest(db) : await migrateDown(db);

for (const r of result.results) {
  console.log(`${r.status}: ${r.migrationName}`);
}

await db.destroy();

if (!result.ok) {
  console.error("Migration failed:", result.error);
  process.exit(1);
}
