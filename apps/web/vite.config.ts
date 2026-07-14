/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-server proxy forwards /api and /socket.io to the Fastify server on
// the same origin as the page -- avoids needing CORS_ORIGIN configured for
// local dev, and mirrors how a production deployment would typically sit
// both behind one reverse-proxy origin.
export default defineConfig({
  plugins: [react()],
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
