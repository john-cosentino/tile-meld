import { useState } from "react";
import "./tabletop-assets.css";
import {
  ART_REQUIREMENTS,
  REQUIRED_ART_REQUIREMENTS,
  OPTIONAL_ART_REQUIREMENTS,
  type ArtRequirement,
} from "../tabletop-concept/artRequirements.js";
import { resolveAssetUrl } from "./resolveAssets.js";
import { AssetSlotCard } from "./AssetSlotCard.js";

const GROUP_LABELS: Record<ArtRequirement["group"], string> = {
  masthead: "Masthead",
  board: "Board",
  rack: "Rack",
  competitor: "Competitor rail",
  sidebar: "Sidebar",
  action: "Action controls",
  chrome: "Chrome",
};

const GROUP_ORDER: readonly ArtRequirement["group"][] = [
  "masthead",
  "board",
  "rack",
  "competitor",
  "sidebar",
  "action",
  "chrome",
];

type Background = "navy" | "light" | "grid";

/**
 * Dev-only art-requirements preview lab -- reads artRequirements.ts and
 * shows every required/optional asset slot: real preview if the file
 * already exists under apps/web/src/assets/tabletop-production/, a
 * "NOT SUPPLIED" technical-guide box otherwise. Never fabricates polished
 * replacement art for a missing asset. See
 * docs/meld-masters-tabletop-art-integration-contract.md.
 */
export function ConceptAssetLab() {
  const [background, setBackground] = useState<Background>("navy");

  const suppliedCount = ART_REQUIREMENTS.filter((r) => resolveAssetUrl(r.filename)).length;

  return (
    <div className={`asset-lab asset-lab--bg-${background}`}>
      <header className="asset-lab-header">
        <div>
          <h1 className="asset-lab-title">Tabletop art requirements -- preview lab</h1>
          <p className="asset-lab-subtitle">
            Development-only. Reads apps/web/src/prototypes/tabletop-concept/artRequirements.ts.
            Never ships in production.
          </p>
        </div>

        <div className="asset-lab-stats">
          <span className="asset-lab-stat">
            <strong>{REQUIRED_ART_REQUIREMENTS.length}</strong> required
          </span>
          <span className="asset-lab-stat">
            <strong>{OPTIONAL_ART_REQUIREMENTS.length}</strong> optional
          </span>
          <span className="asset-lab-stat">
            <strong>{suppliedCount}</strong> / {ART_REQUIREMENTS.length} supplied
          </span>
        </div>

        <div className="asset-lab-bg-switcher" role="group" aria-label="Preview background">
          {(["navy", "light", "grid"] as const).map((bg) => (
            <button
              key={bg}
              aria-pressed={background === bg}
              onClick={() => setBackground(bg)}
              type="button"
            >
              {bg === "navy" ? "Dark navy" : bg === "light" ? "Light neutral" : "Neon grid"}
            </button>
          ))}
        </div>
      </header>

      {GROUP_ORDER.map((group) => {
        const items = ART_REQUIREMENTS.filter((r) => r.group === group);
        if (items.length === 0) return null;
        return (
          <section className="asset-lab-group" key={group}>
            <h2 className="asset-lab-group-title">{GROUP_LABELS[group]}</h2>
            <div className="asset-lab-grid">
              {items.map((req) => (
                <AssetSlotCard req={req} key={req.id} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
