/// <reference types="vitest/config" />
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Dev-only alignment overlay for the static tabletop concept prototype
// (apps/web/src/prototypes/tabletop-concept/ConceptOverlay.tsx). Serves the
// two binding concept-art references directly from
// docs/design-reference/meld-masters/ on disk, allow-listed by filename --
// never copied into apps/web's own assets or bundled by `vite build`.
// `configureServer` is a dev-server-only Vite plugin hook: it is simply
// never invoked during `vite build`, so this has no production footprint
// by construction, independent of the prototype route's own DEV guard.
const ALLOWED_CONCEPT_FILES = new Set([
  "meld-masters-concept-01.png",
  "meld-masters-concept-04.png",
]);
const CONCEPT_ART_DIR = path.resolve(HERE, "../../docs/design-reference/meld-masters");

function devConceptArtPlugin(): Plugin {
  return {
    name: "dev-only-concept-art-server",
    configureServer(server) {
      server.middlewares.use("/__dev-concept-art", (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "").replace(/^\//, "").split("?")[0]);
        if (!ALLOWED_CONCEPT_FILES.has(name)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        const filePath = path.join(CONCEPT_ART_DIR, name);
        access(filePath)
          .then(() => {
            res.setHeader("Content-Type", "image/png");
            createReadStream(filePath).pipe(res);
          })
          .catch(() => next());
      });
    },
  };
}

// Dev-server proxy forwards /api and /socket.io to the Fastify server on
// the same origin as the page -- avoids needing CORS_ORIGIN configured for
// local dev, and mirrors how a production deployment would typically sit
// both behind one reverse-proxy origin.
export default defineConfig({
  plugins: [react(), devConceptArtPlugin()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
      "/socket.io": { target: "http://localhost:3000", changeOrigin: true, ws: true },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
