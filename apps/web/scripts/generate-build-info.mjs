// Writes dist/build-info.json after `vite build` -- the "which commit is
// this?" answer the deployment postmortem needed (production silently
// serving a build several days stale, with no way for anyone -- including
// an installed PWA -- to tell). Deliberately a plain static JSON file
// served by the same @fastify/static that serves everything else in
// apps/web/dist, not a new server route: one less thing to keep in sync
// with the deployed frontend build it's describing.
//
// Never throws: missing version metadata must never fail a production
// build. Contains no secrets, env vars beyond the commit id, tokens, or
// paths -- see the field list below.
import { writeFile, readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Pure (dependency-injected, no direct fs/child_process/Date access) so
 * it's unit-testable without a real build, real git, or a real clock --
 * see test/generate-build-info.test.ts. */
export function resolveCommit(env, gitRevParse) {
  // Render's Docker builds pass this as a build ARG (see the repo-root
  // Dockerfile's `ARG RENDER_GIT_COMMIT`), which Render's platform
  // populates automatically with the exact commit SHA being deployed.
  // `.dockerignore` excludes `.git` from the build context entirely, so
  // this build ARG is the only reliable source in that Docker stage --
  // `gitRevParse` only ever succeeds for `pnpm run build` outside Docker
  // (a dev machine, or CI), where `.git` genuinely is present.
  if (env.RENDER_GIT_COMMIT) return env.RENDER_GIT_COMMIT;
  try {
    return gitRevParse();
  } catch {
    return "unknown";
  }
}

export function buildInfoFrom({ env, gitRevParse, packageVersion, now }) {
  const commit = resolveCommit(env, gitRevParse);
  return {
    commit,
    commitShort: commit === "unknown" ? "unknown" : commit.slice(0, 7),
    builtAt: now.toISOString(),
    version: packageVersion ?? "unknown",
  };
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const webRoot = path.resolve(here, "..");
  const distDir = path.join(webRoot, "dist");

  let packageVersion = "unknown";
  try {
    const pkg = JSON.parse(await readFile(path.join(webRoot, "package.json"), "utf8"));
    if (typeof pkg.version === "string") packageVersion = pkg.version;
  } catch {
    // Missing/unreadable package.json -- keep the "unknown" default.
  }

  const info = buildInfoFrom({
    env: process.env,
    gitRevParse: () => execSync("git rev-parse HEAD", { cwd: webRoot }).toString().trim(),
    packageVersion,
    now: new Date(),
  });

  await writeFile(path.join(distDir, "build-info.json"), JSON.stringify(info, null, 2));
  console.log(`build-info.json: ${info.commitShort} (${info.builtAt})`);
}

// Only run the CLI when invoked directly (`node generate-build-info.mjs`),
// not when imported by the test file.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // Missing build metadata is not a reason to fail a production build --
    // log loudly and move on rather than blocking a deploy over this.
    console.error("generate-build-info.mjs failed (non-fatal):", err);
  });
}
