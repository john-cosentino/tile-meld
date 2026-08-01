import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guards the arcade asset pipeline (scripts/extract-arcade-kit.py): every
// manifest entry must have a valid rect inside its source image, sane slice
// insets, and an extracted PNG on disk whose dimensions match the rect.
// If these fail after editing scripts/arcade-kit.manifest.json, re-run
// `python3 scripts/extract-arcade-kit.py`.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const manifestPath = path.join(repoRoot, "scripts/arcade-kit.manifest.json");
const assetRoot = path.join(repoRoot, "apps/web/src/assets/arcade");

interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface ManifestAsset {
  source: string;
  rect: [number, number, number, number];
  slice?: Insets;
  transparentInset?: Insets;
  center?: string;
  out: string;
}

interface Manifest {
  sources: Record<string, string>;
  assets: Record<string, ManifestAsset>;
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

/** Width/height from a PNG's IHDR chunk (bytes 16..24). */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const sourceSizes = new Map<string, { width: number; height: number }>(
  Object.entries(manifest.sources).map(([key, rel]) => [key, pngSize(path.join(repoRoot, rel))]),
);

describe("arcade-kit manifest", () => {
  it("has at least the core asset set", () => {
    expect(Object.keys(manifest.assets).length).toBeGreaterThan(40);
  });

  for (const [name, asset] of Object.entries(manifest.assets)) {
    describe(name, () => {
      it("declares a rect inside its source image", () => {
        const size = sourceSizes.get(asset.source);
        expect(size, `unknown source ${asset.source}`).toBeDefined();
        const [x, y, w, h] = asset.rect;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
        expect(x + w).toBeLessThanOrEqual(size!.width);
        expect(y + h).toBeLessThanOrEqual(size!.height);
      });

      it("has slice insets smaller than the rect", () => {
        const [, , w, h] = asset.rect;
        for (const insets of [asset.slice, asset.transparentInset]) {
          if (!insets) continue;
          expect(insets.left + insets.right).toBeLessThan(w);
          expect(insets.top + insets.bottom).toBeLessThan(h);
        }
      });

      it("has an extracted PNG matching the rect dimensions", () => {
        const file = path.join(assetRoot, asset.out);
        expect(existsSync(file), `${asset.out} missing -- run extract-arcade-kit.py`).toBe(true);
        const { width, height } = pngSize(file);
        expect(width).toBe(asset.rect[2]);
        expect(height).toBe(asset.rect[3]);
      });

      it("is exported from the generated TypeScript manifest", () => {
        const ts = readFileSync(path.join(assetRoot, "manifest.ts"), "utf8");
        expect(ts).toContain(JSON.stringify(name));
      });
    });
  }
});
