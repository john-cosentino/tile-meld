// Machine-readable art-requirements registry for the static tabletop
// concept prototype (docs/meld-masters-chatgpt-art-production-handoff.md).
//
// This is a REQUIREMENTS REGISTRY, not a runtime importer. Nothing here
// imports an image file -- every `filename` below names an asset that may
// or may not exist yet under apps/web/src/assets/tabletop-production/. The
// dev-only asset preview lab (ConceptAssetLab, /prototype/tabletop-assets)
// is the only consumer: it reads this array, attempts to resolve each
// asset via import.meta.glob, and renders either the real preview or a
// "NOT SUPPLIED" technical guide box. See
// docs/meld-masters-tabletop-art-integration-contract.md for how an
// approved asset actually gets wired into the real layout components
// later -- that wiring is explicitly NOT part of this checkpoint.
//
// Dimensions below are the exact fixed-pixel box sizes the v2 prototype's
// ScaledArtboard canvases render at (1440x900 desktop / 390x844 phone
// portrait / 844x390 phone landscape) -- not estimates. Source: the literal
// flex-basis/grid-template values in tabletop-concept.css, cross-checked
// against the zero-scroll, zero-clip v2 screenshots under
// docs/design-reference/tabletop-static-prototype-review-v2/.

export type Layout = "desktop" | "phone-portrait" | "phone-landscape";

export type ArtRequirement = {
  readonly id: string;
  readonly filename: string;
  readonly title: string;
  readonly priority: "required" | "optional";
  readonly group: "masthead" | "board" | "rack" | "competitor" | "sidebar" | "action" | "chrome";
  readonly layouts: readonly Layout[];
  readonly sourceDimensions: { readonly width: number; readonly height: number };
  readonly renderedDimensions: readonly {
    readonly layout: Layout;
    readonly width: number;
    readonly height: number;
  }[];
  readonly format: "png" | "webp" | "svg";
  readonly transparency: "required" | "opaque" | "either";
  readonly stretchMode: "fixed" | "nine-slice" | "border-image" | "repeat" | "contain" | "layered";
  readonly safeContentArea?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly nineSliceInsets?: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  readonly consumer: string;
  readonly targetDirectory: string;
  readonly maxBytes: number;
  readonly notes: string;
};

export const ART_REQUIREMENTS: readonly ArtRequirement[] = [
  // ---------------------------------------------------------------- masthead
  {
    id: "wordmark-illustrated",
    filename: "wordmark-meld-masters.png",
    title: "Illustrated Meld Masters wordmark lockup",
    priority: "required",
    group: "masthead",
    layouts: ["desktop", "phone-portrait", "phone-landscape"],
    sourceDimensions: { width: 2400, height: 900 },
    renderedDimensions: [
      { layout: "desktop", width: 980, height: 118 },
      { layout: "phone-portrait", width: 300, height: 70 },
      { layout: "phone-landscape", width: 260, height: 46 },
    ],
    format: "png",
    transparency: "required",
    stretchMode: "contain",
    safeContentArea: { x: 0, y: 0, width: 2400, height: 900 },
    consumer: "ConceptBrandMark.tsx",
    targetDirectory: "apps/web/src/assets/tabletop-production/masthead/",
    maxBytes: 400_000,
    notes:
      "Single high-resolution master, rendered via CSS object-fit:contain at each layout's size (a logo scales cleanly, unlike a stretched frame -- no per-layout variant needed). Replaces the live-text gradient <h1> entirely; PRODUCT_NAME stays as an aria-label/alt fallback, never baked-in game data.",
  },
  {
    id: "plaque-frame",
    filename: "plaque-frame.png",
    title: "League/season and round/target/table status plaque frame",
    priority: "optional",
    group: "masthead",
    layouts: ["desktop", "phone-landscape"],
    sourceDimensions: { width: 420, height: 280 },
    renderedDimensions: [
      { layout: "desktop", width: 210, height: 139 },
      { layout: "phone-landscape", width: 130, height: 40 },
    ],
    format: "png",
    transparency: "required",
    stretchMode: "nine-slice",
    safeContentArea: { x: 60, y: 40, width: 300, height: 200 },
    nineSliceInsets: { top: 40, right: 60, bottom: 40, left: 60 },
    consumer: "ConceptPlaque.tsx",
    targetDirectory: "apps/web/src/assets/tabletop-production/masthead/",
    maxBytes: 60_000,
    notes:
      "Current CSS notched-panel treatment (.concept-panel) is already a close match -- this only upgrades the border to a richer beveled/metallic look. Not required for first approval.",
  },

  // -------------------------------------------------------------------- board
  {
    id: "board-frame-desktop",
    filename: "board-frame-desktop.png",
    title: "Tapered arcade board cabinet frame -- desktop",
    priority: "required",
    group: "board",
    layouts: ["desktop"],
    sourceDimensions: { width: 1728, height: 940 },
    renderedDimensions: [{ layout: "desktop", width: 864, height: 470 }],
    format: "png",
    transparency: "required",
    stretchMode: "layered",
    safeContentArea: { x: 130, y: 90, width: 1468, height: 780 },
    consumer: "ConceptBoard.tsx",
    targetDirectory: "apps/web/src/assets/tabletop-production/board/",
    maxBytes: 500_000,
    notes:
      "Replaces the CSS clip-path taper + gradients. Delivered at 2x the rendered size (1728x940) for crisp scaling; applied via background-image + background-size:100% 100% (the box is fixed-size within the ScaledArtboard canvas, so distortion risk is minimal). Do NOT use nine-slice -- the taper's diagonal side edges break the straight-edge assumption nine-slice depends on.",
  },
  {
    id: "board-frame-phone-portrait",
    filename: "board-frame-phone-portrait.png",
    title: "Tapered arcade board cabinet frame -- phone portrait",
    priority: "required",
    group: "board",
    layouts: ["phone-portrait"],
    sourceDimensions: { width: 748, height: 560 },
    renderedDimensions: [{ layout: "phone-portrait", width: 374, height: 280 }],
    format: "png",
    transparency: "required",
    stretchMode: "layered",
    safeContentArea: { x: 50, y: 50, width: 648, height: 460 },
    consumer: "ConceptBoard.tsx",
    targetDirectory: "apps/web/src/assets/tabletop-production/board/",
    maxBytes: 350_000,
    notes:
      "A dedicated variant, not the desktop asset scaled down -- the portrait board's aspect ratio (~1.34:1) is far narrower than desktop's (~1.84:1); stretching one master would visibly flatten or exaggerate the taper angle.",
  },
  {
    id: "board-frame-phone-landscape",
    filename: "board-frame-phone-landscape.png",
    title: "Tapered arcade board cabinet frame -- phone landscape",
    priority: "required",
    group: "board",
    layouts: ["phone-landscape"],
    sourceDimensions: { width: 1068, height: 546 },
    renderedDimensions: [{ layout: "phone-landscape", width: 534, height: 273 }],
    format: "png",
    transparency: "required",
    stretchMode: "layered",
    safeContentArea: { x: 70, y: 50, width: 928, height: 446 },
    consumer: "ConceptBoard.tsx",
    targetDirectory: "apps/web/src/assets/tabletop-production/board/",
    maxBytes: 350_000,
    notes:
      "A third dedicated variant -- landscape's short, wide board (~1.96:1, similar ratio to desktop but far shorter absolute height) needs its own taper proportions so the perspective rails stay legible at 273px tall instead of 470px.",
  },
  {
    id: "board-texture",
    filename: "board-surface-texture.png",
    title: "Seamless board felt/circuit-grid surface texture",
    priority: "optional",
    group: "board",
    layouts: ["desktop", "phone-portrait", "phone-landscape"],
    sourceDimensions: { width: 256, height: 256 },
    renderedDimensions: [
      { layout: "desktop", width: 864, height: 470 },
      { layout: "phone-portrait", width: 374, height: 280 },
      { layout: "phone-landscape", width: 534, height: 273 },
    ],
    format: "png",
    transparency: "either",
    stretchMode: "repeat",
    consumer: "ConceptBoard.tsx (background-image, layered under the board frame)",
    targetDirectory: "apps/web/src/assets/tabletop-production/board/",
    maxBytes: 80_000,
    notes:
      "Small seamless repeating tile (CSS background-repeat), one asset shared across all layouts. The current CSS repeating-linear-gradient grid is a reasonably close stand-in -- only pursue this if the CSS grid still reads as flat after the frame asset is in place.",
  },

  // --------------------------------------------------------------------- rack
  {
    id: "rack-frame",
    filename: "rack-frame.png",
    title: "Rack tray shell, attached to the board's lower edge",
    priority: "required",
    group: "rack",
    layouts: ["desktop", "phone-portrait", "phone-landscape"],
    sourceDimensions: { width: 480, height: 96 },
    renderedDimensions: [
      { layout: "desktop", width: 864, height: 140 },
      { layout: "phone-portrait", width: 374, height: 84 },
      { layout: "phone-landscape", width: 534, height: 56 },
    ],
    format: "png",
    transparency: "required",
    stretchMode: "nine-slice",
    safeContentArea: { x: 40, y: 30, width: 400, height: 50 },
    nineSliceInsets: { top: 28, right: 24, bottom: 14, left: 24 },
    consumer: "ConceptRack.tsx",
    targetDirectory: "apps/web/src/assets/tabletop-production/rack/",
    maxBytes: 150_000,
    notes:
      "One asset shared by all three layouts and both required and optional future real-tabletop use -- a plain rectangle, so nine-slice handles the wide range of target widths/heights cleanly. Top 28px inset carries the thick ivory divider bar that visually welds the rack to the board above it.",
  },

  // -------------------------------------------------------------- competitor
  {
    id: "competitor-card-frame",
    filename: "competitor-card-frame.png",
    title: "Neutral competitor card frame (colorized via CSS)",
    priority: "optional",
    group: "competitor",
    layouts: ["desktop", "phone-portrait", "phone-landscape"],
    sourceDimensions: { width: 500, height: 350 },
    renderedDimensions: [
      { layout: "desktop", width: 250, height: 175 },
      { layout: "phone-portrait", width: 127, height: 132 },
      { layout: "phone-landscape", width: 79, height: 118 },
    ],
    format: "png",
    transparency: "required",
    stretchMode: "nine-slice",
    safeContentArea: { x: 60, y: 40, width: 380, height: 270 },
    nineSliceInsets: { top: 30, right: 30, bottom: 30, left: 30 },
    consumer: "ConceptCompetitorRail.tsx (ConceptCompetitorCard)",
    targetDirectory: "apps/web/src/assets/tabletop-production/competitors/",
    maxBytes: 90_000,
    notes:
      "Delivered as ONE neutral (light gray/white-line) frame; the existing per-seat accent color is applied in CSS (currentColor border on the portrait, text color) exactly as today -- do not deliver 5 separately-colored frame files. Current CSS notched-panel border is already a close match; this is a polish upgrade, not a first-approval blocker.",
  },
  {
    id: "competitor-active-overlay",
    filename: "competitor-active-overlay.png",
    title: "Active-turn glow overlay for the competitor card frame",
    priority: "optional",
    group: "competitor",
    layouts: ["desktop", "phone-portrait", "phone-landscape"],
    sourceDimensions: { width: 500, height: 350 },
    renderedDimensions: [
      { layout: "desktop", width: 250, height: 175 },
      { layout: "phone-portrait", width: 127, height: 132 },
      { layout: "phone-landscape", width: 79, height: 118 },
    ],
    format: "png",
    transparency: "required",
    stretchMode: "nine-slice",
    nineSliceInsets: { top: 30, right: 30, bottom: 30, left: 30 },
    consumer: "ConceptCompetitorRail.tsx (.concept-competitor--active)",
    targetDirectory: "apps/web/src/assets/tabletop-production/competitors/",
    maxBytes: 60_000,
    notes:
      "Layered above competitor-card-frame only when a card is active; the existing CSS box-shadow glow ring is a functionally adequate stand-in. Text ('YOUR TURN'/an hourglass glyph elsewhere in the real app) is always the actual accessibility signal, never this glow alone.",
  },

  // ---------------------------------------------------------------- sidebar
  {
    id: "sidebar-panel-frame",
    filename: "sidebar-panel-frame.png",
    title: "Right-rail / support-row panel shell (turn, move log, tip)",
    priority: "optional",
    group: "sidebar",
    layouts: ["desktop", "phone-portrait", "phone-landscape"],
    sourceDimensions: { width: 580, height: 440 },
    renderedDimensions: [
      { layout: "desktop", width: 290, height: 220 },
      { layout: "phone-portrait", width: 184, height: 68 },
      { layout: "phone-landscape", width: 170, height: 175 },
    ],
    format: "png",
    transparency: "required",
    stretchMode: "nine-slice",
    safeContentArea: { x: 40, y: 30, width: 500, height: 380 },
    nineSliceInsets: { top: 24, right: 24, bottom: 24, left: 24 },
    consumer: "ConceptSidebar.tsx (.concept-sidebar-section)",
    targetDirectory: "apps/web/src/assets/tabletop-production/sidebar/",
    maxBytes: 90_000,
    notes:
      "One reusable nine-slice frame for every sidebar/support-row section across all three layouts -- do not request a separate asset per section (turn/move-log/tip). Current CSS is already close; polish only.",
  },
  {
    id: "countdown-screen-bezel",
    filename: "countdown-screen-bezel.png",
    title: "Inset LCD-style bezel behind the turn countdown digits",
    priority: "optional",
    group: "sidebar",
    layouts: ["desktop", "phone-landscape"],
    sourceDimensions: { width: 420, height: 160 },
    renderedDimensions: [
      { layout: "desktop", width: 260, height: 60 },
      { layout: "phone-landscape", width: 150, height: 30 },
    ],
    format: "png",
    transparency: "required",
    stretchMode: "nine-slice",
    nineSliceInsets: { top: 20, right: 20, bottom: 20, left: 20 },
    consumer: "ConceptSidebar.tsx (.concept-turn-countdown)",
    targetDirectory: "apps/web/src/assets/tabletop-production/sidebar/",
    maxBytes: 40_000,
    notes:
      "Sits behind the live countdown text only (never bakes in digits). The countdown segmented progress bar stays CSS (repeating-linear-gradient) -- cheap, already close, not worth a texture asset.",
  },
  {
    id: "mascot-tip-icon",
    filename: "mascot-tip-icon.png",
    title: "Small illustrated mascot for the how-to-play tip callout",
    priority: "optional",
    group: "sidebar",
    layouts: ["desktop"],
    sourceDimensions: { width: 240, height: 240 },
    renderedDimensions: [{ layout: "desktop", width: 48, height: 48 }],
    format: "png",
    transparency: "required",
    stretchMode: "fixed",
    consumer: "ConceptSidebar.tsx (how-to-play section, decorative only)",
    targetDirectory: "apps/web/src/assets/tabletop-production/sidebar/",
    maxBytes: 60_000,
    notes:
      "No approved mascot asset exists anywhere in the repo today. Lowest-priority optional item -- the tip line already reads fine as text-only.",
  },

  // ----------------------------------------------------------------- action
  {
    id: "action-plate-cyan",
    filename: "action-plate-cyan.png",
    title: "Cabinet button plate -- cyan (Draw, Sort)",
    priority: "required",
    group: "action",
    layouts: ["desktop", "phone-portrait", "phone-landscape"],
    sourceDimensions: { width: 480, height: 220 },
    renderedDimensions: [
      { layout: "desktop", width: 206, height: 85 },
      { layout: "phone-portrait", width: 175, height: 55 },
      { layout: "phone-landscape", width: 78, height: 44 },
    ],
    format: "png",
    transparency: "required",
    stretchMode: "nine-slice",
    safeContentArea: { x: 60, y: 40, width: 360, height: 140 },
    nineSliceInsets: { top: 32, right: 32, bottom: 32, left: 32 },
    consumer: "ConceptActionBar.tsx (.concept-action-button--cyan)",
    targetDirectory: "apps/web/src/assets/tabletop-production/actions/",
    maxBytes: 70_000,
    notes:
      "Default (resting) state only -- see action-plate-states for hover/active/disabled. One asset reused at every layout's button size via nine-slice.",
  },
  {
    id: "action-plate-purple",
    filename: "action-plate-purple.png",
    title: "Cabinet button plate -- purple (Pass)",
    priority: "required",
    group: "action",
    layouts: ["desktop", "phone-portrait", "phone-landscape"],
    sourceDimensions: { width: 480, height: 220 },
    renderedDimensions: [
      { layout: "desktop", width: 206, height: 85 },
      { layout: "phone-portrait", width: 175, height: 55 },
      { layout: "phone-landscape", width: 78, height: 44 },
    ],
    format: "png",
    transparency: "required",
    stretchMode: "nine-slice",
    safeContentArea: { x: 60, y: 40, width: 360, height: 140 },
    nineSliceInsets: { top: 32, right: 32, bottom: 32, left: 32 },
    consumer: "ConceptActionBar.tsx (.concept-action-button--purple)",
    targetDirectory: "apps/web/src/assets/tabletop-production/actions/",
    maxBytes: 70_000,
    notes: "Same construction as action-plate-cyan, purple accent only.",
  },
  {
    id: "action-plate-gold",
    filename: "action-plate-gold.png",
    title: "Cabinet button plate -- filled gold (Commit Turn, strongest action)",
    priority: "required",
    group: "action",
    layouts: ["desktop", "phone-portrait", "phone-landscape"],
    sourceDimensions: { width: 480, height: 220 },
    renderedDimensions: [
      { layout: "desktop", width: 206, height: 85 },
      { layout: "phone-portrait", width: 175, height: 55 },
      { layout: "phone-landscape", width: 78, height: 44 },
    ],
    format: "png",
    transparency: "required",
    stretchMode: "nine-slice",
    safeContentArea: { x: 60, y: 40, width: 360, height: 140 },
    nineSliceInsets: { top: 32, right: 32, bottom: 32, left: 32 },
    consumer: "ConceptActionBar.tsx (.concept-action-button--gold)",
    targetDirectory: "apps/web/src/assets/tabletop-production/actions/",
    maxBytes: 70_000,
    notes:
      "Must read as visibly heavier/brighter than the cyan/purple plates at a glance -- Commit Turn is the concept's strongest action.",
  },
  {
    id: "action-plate-states",
    filename: "action-plate-states.png",
    title: "Hover / pressed / disabled overlay treatments for the button plates",
    priority: "optional",
    group: "action",
    layouts: ["desktop", "phone-portrait", "phone-landscape"],
    sourceDimensions: { width: 480, height: 220 },
    renderedDimensions: [
      { layout: "desktop", width: 206, height: 85 },
      { layout: "phone-portrait", width: 175, height: 55 },
      { layout: "phone-landscape", width: 78, height: 44 },
    ],
    format: "png",
    transparency: "required",
    stretchMode: "nine-slice",
    nineSliceInsets: { top: 32, right: 32, bottom: 32, left: 32 },
    consumer: "ConceptActionBar.tsx (CSS :hover/:active/[disabled] compositing)",
    targetDirectory: "apps/web/src/assets/tabletop-production/actions/",
    maxBytes: 70_000,
    notes:
      "A single semi-transparent overlay (darken for pressed, desaturate+dim for disabled, brighten for hover) composited over any base plate via CSS mix-blend-mode/opacity, not 12 separate per-color per-state exports. CSS-only opacity/filter changes on the base plates are an acceptable first-pass substitute.",
  },
  {
    id: "action-icons-illustrated",
    filename: "action-icons-illustrated.svg",
    title: "Illustrated Draw/Pass/Sort/Commit icon set (upgrade)",
    priority: "optional",
    group: "action",
    layouts: ["desktop", "phone-portrait", "phone-landscape"],
    sourceDimensions: { width: 96, height: 96 },
    renderedDimensions: [
      { layout: "desktop", width: 22, height: 22 },
      { layout: "phone-portrait", width: 16, height: 16 },
      { layout: "phone-landscape", width: 12, height: 12 },
    ],
    format: "svg",
    transparency: "required",
    stretchMode: "contain",
    consumer: "ConceptIcons.tsx (DrawIcon/PassIcon/SortIcon/CommitIcon)",
    targetDirectory: "apps/web/src/assets/tabletop-production/actions/",
    maxBytes: 20_000,
    notes:
      "ConceptIcons.tsx already ships adequate original stroke-based SVG icons (a card stack, a raised palm, ascending bars, a checkmark ring) -- functionally complete and original today. Only pursue this if the user specifically wants a richer illustrated style matching the concept's icon motifs more closely; not required for first approval.",
  },

  // ------------------------------------------------------------------ chrome
  {
    id: "footer-chrome-icons",
    filename: "footer-chrome-icons.svg",
    title: "Decorative lightning-bolt and stat-bars corner glyphs",
    priority: "optional",
    group: "chrome",
    layouts: ["phone-portrait"],
    sourceDimensions: { width: 64, height: 64 },
    renderedDimensions: [{ layout: "phone-portrait", width: 14, height: 14 }],
    format: "svg",
    transparency: "required",
    stretchMode: "fixed",
    consumer: "ConceptPhonePortraitLayout.tsx (.concept-phone-footer)",
    targetDirectory: "apps/web/src/assets/tabletop-production/chrome/",
    maxBytes: 10_000,
    notes:
      "Tiny, purely decorative corner glyphs from concept-04's footer strip. Lowest priority in the whole registry -- simple enough to do as inline SVG without a ChatGPT round-trip if ever pursued.",
  },
] as const;

export const REQUIRED_ART_REQUIREMENTS: readonly ArtRequirement[] = ART_REQUIREMENTS.filter(
  (a) => a.priority === "required",
);

export const OPTIONAL_ART_REQUIREMENTS: readonly ArtRequirement[] = ART_REQUIREMENTS.filter(
  (a) => a.priority === "optional",
);
