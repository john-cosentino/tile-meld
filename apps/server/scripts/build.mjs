import { build } from "esbuild";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

// Real npm dependencies stay external, resolved from node_modules at
// runtime -- @node-rs/argon2 in particular has a native binding that
// can't be bundled into JS at all. Only the workspace-internal
// @tile-meld/* packages (plain TS source with no build step of their
// own) get inlined into the bundle.
const external = Object.keys(pkg.dependencies ?? {}).filter(
  (name) => !name.startsWith("@tile-meld/"),
);

rmSync(path.join(root, "dist"), { recursive: true, force: true });

const shared = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2023",
  sourcemap: true,
  external,
  absWorkingDir: root,
};

await build({
  ...shared,
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
});

await build({
  ...shared,
  entryPoints: ["src/db/migrate-cli.ts"],
  outfile: "dist/migrate-cli.js",
});

// FileMigrationProvider (kysely) reads apps/server/src/db/migrations at
// runtime via fs.readdir, resolved relative to migrator.ts's own
// import.meta.url -- a dynamic directory scan esbuild's static bundling
// can't see into. Once migrate-cli.ts is bundled into a single
// dist/migrate-cli.js, that relative lookup resolves to dist/migrations,
// so each migration file has to be compiled and placed there explicitly,
// not just pulled into the migrate-cli.js bundle by reference.
const migrationsDir = path.join(root, "src/db/migrations");
const migrationEntries = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => `src/db/migrations/${f}`);

await build({
  ...shared,
  entryPoints: migrationEntries,
  outdir: "dist/migrations",
  outbase: "src/db/migrations",
});

console.log("Built dist/index.js, dist/migrate-cli.js, and dist/migrations/*.js");
