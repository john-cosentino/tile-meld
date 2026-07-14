# syntax=docker/dockerfile:1
FROM node:24-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate

# Install dependencies in their own layer so source-only changes don't
# invalidate the pnpm install cache.
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/engine/package.json packages/engine/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY e2e/package.json e2e/package.json
RUN pnpm install --frozen-lockfile

# Phase 0: run the server directly from TypeScript source via tsx. A
# compiled production build is introduced in a later deployment phase.
FROM deps AS runtime
COPY . .
WORKDIR /app/apps/server
EXPOSE 3000
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
