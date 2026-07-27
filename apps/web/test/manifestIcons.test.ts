import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { PRODUCT_NAME, THEME_COLOR } from "@tile-meld/shared";

// Phase 6 (docs/meld-masters-visual-refresh-plan.md §6.2-6.3): the icon
// pipeline and installed-app metadata. Same anchoring approach as
// brandConsistency.test.ts -- resolved from this file's own location, not
// process.cwd(), and reading real files rather than re-deriving expected
// bytes, so a regression in the actual shipped asset is what fails this,
// not a copy of the same assumption.
const webRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const publicDir = path.join(webRoot, "public");

const OLD_THEME_COLOR = "#2f6fb4"; // pre-Phase-6 Tile Meld blue

function readWebFile(relativePath: string): string {
  return readFileSync(path.join(webRoot, relativePath), "utf-8");
}

function readPng(relativePathUnderPublic: string): PNG {
  const buffer = readFileSync(path.join(publicDir, relativePathUnderPublic));
  return PNG.sync.read(buffer);
}

/** True if every pixel in a 3x3 block at the given corner is fully
 * transparent (alpha 0). A single-pixel sample risks landing exactly on
 * an antialiased silhouette edge; a small block is a more robust check of
 * "this corner region is transparent" without needing exact geometry. */
function cornerIsTransparent(png: PNG, corner: "tl" | "tr" | "bl" | "br"): boolean {
  const { width, height, data } = png;
  const xs = corner === "tl" || corner === "bl" ? [0, 1, 2] : [width - 3, width - 2, width - 1];
  const ys = corner === "tl" || corner === "tr" ? [0, 1, 2] : [height - 3, height - 2, height - 1];
  for (const y of ys) {
    for (const x of xs) {
      const alpha = data[(width * y + x) * 4 + 3]!;
      if (alpha !== 0) return false;
    }
  }
  return true;
}

/** True if every pixel in a 3x3 block at the given corner is fully opaque
 * (alpha 255, or no alpha channel at all -- pngjs always reports RGBA, but
 * a source PNG with no alpha channel reads back as alpha=255 uniformly). */
function cornerIsOpaque(png: PNG, corner: "tl" | "tr" | "bl" | "br"): boolean {
  const { width, height, data } = png;
  const xs = corner === "tl" || corner === "bl" ? [0, 1, 2] : [width - 3, width - 2, width - 1];
  const ys = corner === "tl" || corner === "tr" ? [0, 1, 2] : [height - 3, height - 2, height - 1];
  for (const y of ys) {
    for (const x of xs) {
      const alpha = data[(width * y + x) * 4 + 3]!;
      if (alpha !== 255) return false;
    }
  }
  return true;
}

describe("public/manifest.json", () => {
  const raw = readWebFile("public/manifest.json");

  it("parses as valid JSON", () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  const manifest = JSON.parse(raw);

  it("names the app with the current product name", () => {
    expect(manifest.name).toBe(PRODUCT_NAME);
    expect(manifest.short_name).toBe(PRODUCT_NAME);
  });

  it("theme_color and background_color match the shared THEME_COLOR constant", () => {
    expect(manifest.theme_color).toBe(THEME_COLOR);
    expect(manifest.background_color).toBe(THEME_COLOR);
  });

  it("does not use the old Tile Meld blue as its theme color", () => {
    expect(manifest.theme_color).not.toBe(OLD_THEME_COLOR);
    expect(manifest.background_color).not.toBe(OLD_THEME_COLOR);
  });

  it("declares exactly the four required icon entries with correct sizes/type/purpose", () => {
    const expected = [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ];
    expect(manifest.icons).toEqual(expected);
  });

  it("every manifest icon path maps to a real file under public/", () => {
    for (const icon of manifest.icons) {
      const filePath = path.join(publicDir, icon.src.replace(/^\//, ""));
      expect(existsSync(filePath), `missing file for manifest icon ${icon.src}`).toBe(true);
    }
  });

  it("does not reference the old root icon paths", () => {
    expect(raw).not.toContain('"/icon-192.png"');
    expect(raw).not.toContain('"/icon-512.png"');
    expect(raw).not.toContain('"/apple-touch-icon.png"');
  });
});

describe("PNG dimensions and transparency", () => {
  it("icon-192.png / icon-512.png (purpose: any) match declared size and have transparent corners", () => {
    for (const [file, size] of [
      ["icons/icon-192.png", 192],
      ["icons/icon-512.png", 512],
    ] as const) {
      const png = readPng(file);
      expect(png.width, file).toBe(size);
      expect(png.height, file).toBe(size);
      for (const corner of ["tl", "tr", "bl", "br"] as const) {
        expect(
          cornerIsTransparent(png, corner),
          `${file} ${corner} corner should be transparent`,
        ).toBe(true);
      }
    }
  });

  it("maskable icons match declared size and are opaque at every corner", () => {
    for (const [file, size] of [
      ["icons/icon-maskable-192.png", 192],
      ["icons/icon-maskable-512.png", 512],
    ] as const) {
      const png = readPng(file);
      expect(png.width, file).toBe(size);
      expect(png.height, file).toBe(size);
      for (const corner of ["tl", "tr", "bl", "br"] as const) {
        expect(cornerIsOpaque(png, corner), `${file} ${corner} corner should be opaque`).toBe(true);
      }
    }
  });

  it("apple-touch-icon.png is 180x180 and fully opaque at every corner", () => {
    const png = readPng("icons/apple-touch-icon.png");
    expect(png.width).toBe(180);
    expect(png.height).toBe(180);
    for (const corner of ["tl", "tr", "bl", "br"] as const) {
      expect(
        cornerIsOpaque(png, corner),
        `apple-touch-icon.png ${corner} corner should be opaque`,
      ).toBe(true);
    }
  });
});

describe("favicon files", () => {
  it("favicon.ico exists at the web root", () => {
    expect(existsSync(path.join(publicDir, "favicon.ico"))).toBe(true);
    expect(statSync(path.join(publicDir, "favicon.ico")).size).toBeGreaterThan(0);
  });

  it("icons/favicon.svg exists and is a self-contained SVG (no external references)", () => {
    const svgPath = path.join(publicDir, "icons/favicon.svg");
    expect(existsSync(svgPath)).toBe(true);
    const svg = readFileSync(svgPath, "utf-8");
    expect(svg).toContain("<svg");
    // The xmlns="http://www.w3.org/2000/svg" namespace declaration is a
    // fixed XML identifier, not a network reference -- excluded from this
    // check. What must be absent is any *resource* URL (href/src pointing
    // off-host) and any developer-machine path.
    expect(svg).not.toMatch(/(?:href|src)\s*=\s*["']https?:/);
    expect(svg).not.toMatch(/\/home\/|[A-Za-z]:\\/); // no developer-machine path baked in
  });
});

describe("old root icons: transitional compatibility", () => {
  it("the old root icon files still exist (kept for one transitional release)", () => {
    for (const file of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
      expect(
        existsSync(path.join(publicDir, file)),
        `old root icon ${file} should still exist`,
      ).toBe(true);
    }
  });
});

describe("index.html", () => {
  const html = readWebFile("index.html");

  it("references the new /icons/... paths, not the old root icon paths", () => {
    expect(html).toContain("/icons/apple-touch-icon.png");
    expect(html).toContain("/icons/icon-192.png");
    expect(html).toContain("/icons/favicon.svg");
    expect(html).toContain("/favicon.ico");
    expect(html).not.toContain('href="/apple-touch-icon.png"');
    expect(html).not.toContain('href="/icon-192.png"');
  });

  it("theme-color meta matches the manifest's theme_color, and is not the old Tile Meld blue", () => {
    const manifest = JSON.parse(readWebFile("public/manifest.json"));
    expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`);
    expect(html).toContain(`<meta name="theme-color" content="${THEME_COLOR}" />`);
    expect(html).not.toContain(`content="${OLD_THEME_COLOR}"`);
  });

  it("has a non-empty product description meta tag", () => {
    expect(html).toMatch(/<meta\s+name="description"\s+content="[^"]{10,}"/);
  });
});

describe("public/sw.js", () => {
  const sw = readWebFile("public/sw.js");

  it("references the new /icons/icon-192.png path for notification icon and badge", () => {
    expect(sw).toContain('icon: "/icons/icon-192.png"');
    expect(sw).toContain('badge: "/icons/icon-192.png"');
  });

  it("does not reference the old root icon path", () => {
    expect(sw).not.toContain('"/icon-192.png"');
  });

  it("keeps the invisible notification dedup tag as tile-meld (an internal identifier, not a public name)", () => {
    expect(sw).toContain('tag: "tile-meld"');
  });
});

describe("THEME_COLOR stays in sync with global.css --bg-page", () => {
  it("global.css still defines --bg-page with the same value as THEME_COLOR", () => {
    const css = readWebFile("src/styles/global.css");
    expect(css).toContain(`--bg-page: ${THEME_COLOR};`);
  });
});
