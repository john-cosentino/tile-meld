import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { applyBrandingTokens } from "./styles/applyBrandingTokens.js";
import "./styles/global.css";
import "./styles/arcade-kit.css";

applyBrandingTokens();

// One-time, best-effort: logs which commit this build actually is, so a
// stale-looking deployment (or an installed PWA suspected of being pinned
// to an old app shell) can be diagnosed straight from the browser console
// instead of guessing. Fetches the same build-info.json the server itself
// serves (apps/web/scripts/generate-build-info.mjs) -- one source of
// truth, not a second copy embedded at a different build step. Never
// blocks app boot and never throws on a network failure.
void fetch("/build-info.json")
  .then((res) => (res.ok ? res.json() : undefined))
  .then((info: { commitShort?: string; builtAt?: string } | undefined) => {
    if (info?.commitShort) {
      console.log(`Meld Masters build ${info.commitShort} (built ${info.builtAt})`);
    }
  })
  .catch(() => {
    // Offline, build-info.json missing, or a non-JSON response -- silent,
    // this is diagnostic-only and must never affect the app itself.
  });

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
