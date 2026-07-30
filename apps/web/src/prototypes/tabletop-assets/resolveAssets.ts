// Resolves art-requirement filenames against whatever actually exists
// under apps/web/src/assets/tabletop-production/ right now. Uses Vite's
// import.meta.glob, which is perfectly happy to match zero files (an
// empty/nonexistent directory tree just resolves to an empty object, no
// error) -- so this works today, before any asset has ever been supplied,
// exactly as well as it will once approved assets start landing there.
//
// This glob is itself dev-only in effect: it's only ever imported from
// ConceptAssetLab.tsx, which is only ever imported from the dev-gated
// lazy route in App.tsx (see devOnly.ts) -- so even this resolution logic
// never reaches a production bundle.
const modules = import.meta.glob("../../assets/tabletop-production/**/*.{png,webp,svg}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const byBasename = new Map<string, string>();
for (const [filePath, url] of Object.entries(modules)) {
  byBasename.set(filePath.split("/").pop()!, url);
}

/** Returns the resolved dev-server URL for a given required filename, or
 * undefined if that file doesn't exist yet under tabletop-production/. */
export function resolveAssetUrl(filename: string): string | undefined {
  return byBasename.get(filename);
}
