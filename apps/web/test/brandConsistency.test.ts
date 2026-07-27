import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "@tile-meld/shared";

// Guards the branding sites that structurally can't import PRODUCT_NAME --
// index.html, public/manifest.json, and public/sw.js are plain static
// files, not React components -- so nothing at compile time stops them
// from drifting back to a hardcoded (and eventually stale) product name.
// Path resolution is anchored on this test file's own location (not
// process.cwd()), so it works the same regardless of which directory the
// test runner was invoked from.
const webRoot = path.resolve(fileURLToPath(import.meta.url), "../..");

function readWebFile(relativePath: string): string {
  return readFileSync(path.join(webRoot, relativePath), "utf-8");
}

describe("index.html", () => {
  const html = readWebFile("index.html");

  it("titles the page with the current product name", () => {
    expect(html).toContain(`<title>${PRODUCT_NAME}</title>`);
  });

  it("does not contain the old public product name", () => {
    expect(html).not.toContain("Tile Meld");
  });
});

describe("public/manifest.json", () => {
  const raw = readWebFile("public/manifest.json");
  const manifest = JSON.parse(raw);

  it("is valid JSON", () => {
    expect(manifest).toBeTypeOf("object");
  });

  it("names the app with the current product name", () => {
    expect(manifest.name).toBe(PRODUCT_NAME);
    expect(manifest.short_name).toBe(PRODUCT_NAME);
  });

  it("does not contain the old public product name anywhere in the raw file", () => {
    expect(raw).not.toContain("Tile Meld");
  });
});

describe("public/sw.js", () => {
  const sw = readWebFile("public/sw.js");

  it("uses the current product name as the push-notification fallback title", () => {
    expect(sw).toContain(`title: "${PRODUCT_NAME}"`);
  });

  it("does not contain the old public product name", () => {
    expect(sw).not.toContain("Tile Meld");
  });

  it("keeps the invisible notification dedup tag unchanged (not a public name)", () => {
    expect(sw).toContain('tag: "tile-meld"');
  });
});

describe("src/styles/global.css -- Silkscreen self-hosting (Phase 2)", () => {
  const css = readWebFile("src/styles/global.css");

  it("declares Silkscreen via @font-face with a local, relative asset path", () => {
    expect(css).toMatch(/@font-face\s*{[^}]*font-family:\s*"Silkscreen"/);
    expect(css).toContain('url("../assets/fonts/Silkscreen-Regular.woff2") format("woff2")');
    expect(css).toContain('url("../assets/fonts/Silkscreen-Bold.woff2") format("woff2")');
  });

  it("uses font-display: swap so the fallback stack is never invisible while it loads", () => {
    expect(css).toMatch(/font-display:\s*swap/);
  });

  it("makes no runtime request to Google Fonts or any other external host", () => {
    expect(css).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(css).not.toMatch(/@font-face[^}]*url\(\s*["']?https?:/);
  });
});

describe("obsolete-asset guard", () => {
  it("public/ contains only the expected, allowlisted files", () => {
    // A minimal guard against reintroducing old-branding or mahjong-themed
    // assets: every file actually served from public/ must be on this
    // list. A new file failing this test is a prompt to update the list
    // deliberately, not evidence of a bug by itself.
    const allowed = new Set([
      "apple-touch-icon.png",
      "icon-192.png",
      "icon-512.png",
      "manifest.json",
      "sw.js",
    ]);
    const actual = readdirSync(path.join(webRoot, "public"));
    for (const file of actual) {
      expect(allowed.has(file), `unexpected file in public/: ${file}`).toBe(true);
    }
  });
});
