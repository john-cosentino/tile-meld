import type { Kysely } from "kysely";

// Migration files legitimately cannot be typed against the full Database
// schema: early migrations run before later tables exist, and schema
// builder calls (createTable, alterTable, ...) work against the database
// generically regardless. `Kysely<any>` is Kysely's own documented pattern
// for this. Centralized here as the single, justified escape hatch rather
// than disabling the lint rule in every migration file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyKysely = Kysely<any>;
