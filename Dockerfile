# syntax=docker/dockerfile:1
FROM node:24-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate

# Install dependencies in their own layer so source-only changes don't
# invalidate the pnpm install cache. Needs every workspace's package.json
# (not just apps/server's) because pnpm resolves the whole workspace
# lockfile at once, and the devDependencies installed here (vite,
# esbuild, typescript) are needed for the build stage below -- they never
# make it into the runtime image.
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/engine/package.json packages/engine/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY e2e/package.json e2e/package.json
RUN pnpm install --frozen-lockfile

# Builds the static web SPA and the bundled server, then assembles a
# production-only deployable via `pnpm deploy` (resolves the
# @tile-meld/engine and @tile-meld/shared workspace:* deps by copying
# their files in directly, and installs only apps/server's *production*
# npm dependencies -- none of the devtoolchain used to build this
# (typescript, vite, esbuild, vitest, eslint) ships in the runtime image).
# --legacy: the non-legacy deploy path requires
# inject-workspace-packages=true workspace-wide, which would change how
# `pnpm install` links workspace packages everywhere (including local dev
# and CI) just for this one Docker step's benefit -- not worth it for a
# single deploy target.
FROM deps AS build
COPY . .
RUN pnpm --filter @tile-meld/web run build
RUN pnpm --filter @tile-meld/server run build
RUN pnpm --filter @tile-meld/server deploy --prod --legacy /app/deploy/server

FROM base AS runtime
ENV NODE_ENV=production
# The runtime image starts, migrates, and health-checks the app with `node`
# only (see CMD, HEALTHCHECK, and render.yaml's preDeployCommand
# `node dist/migrate-cli.js up`) -- it never runs npm/npx/pnpm. The Node base
# image bundles the npm CLI, which vendors its own copy of undici at
# /usr/local/lib/node_modules/npm/node_modules/undici; that copy trails the
# app's own dependency versions and is what the image scanner flags. Since it
# is unused at runtime, remove the bundled npm CLI (and its vendored deps)
# entirely -- this shrinks the runtime attack surface rather than tracking npm's
# bundled-undici release cadence. `node` itself is untouched.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /app/deploy/server /app/apps/server
COPY --from=build /app/apps/web/dist /app/apps/web/dist
WORKDIR /app/apps/server
EXPOSE 3000
# Reads $PORT at healthcheck-execution time rather than hardcoding 3000:
# this same image runs under docker-compose.prod.yml (PORT=3000 always)
# and Render (auto-injects PORT=10000, overriding whatever's set here --
# see docs/deploy-render.md), and a hardcoded port would silently
# "succeed" at pinging the wrong port and never actually detect a hung
# server on Render.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/index.js"]
