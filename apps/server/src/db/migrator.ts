import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileMigrationProvider, Migrator } from "kysely";
import type { AnyKysely } from "./migration-types.js";

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export function createMigrator(db: AnyKysely): Migrator {
  return new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: migrationsFolder,
    }),
  });
}

export type MigrationRunResult = {
  readonly ok: boolean;
  readonly results: readonly { migrationName: string; status: string }[];
  readonly error?: unknown;
};

export async function migrateToLatest(db: AnyKysely): Promise<MigrationRunResult> {
  const migrator = createMigrator(db);
  const { error, results } = await migrator.migrateToLatest();
  return {
    ok: !error,
    results: (results ?? []).map((r) => ({ migrationName: r.migrationName, status: r.status })),
    error,
  };
}

export async function migrateDown(db: AnyKysely): Promise<MigrationRunResult> {
  const migrator = createMigrator(db);
  const { error, results } = await migrator.migrateDown();
  return {
    ok: !error,
    results: (results ?? []).map((r) => ({ migrationName: r.migrationName, status: r.status })),
    error,
  };
}
