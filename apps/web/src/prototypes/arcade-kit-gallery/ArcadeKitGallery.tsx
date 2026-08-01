import { ArcadePanel } from "../../arcade/ArcadePanel.js";
import { ArcadePlate } from "../../arcade/ArcadePlate.js";
import { ArcadeTileFace } from "../../arcade/ArcadeTile.js";
import { ArcadeLCD } from "../../arcade/ArcadeLCD.js";
import { ArcadeMeter } from "../../arcade/ArcadeMeter.js";
import { PortraitCard, type PortraitCardTone } from "../../arcade/PortraitCard.js";
import { ArcadeIcon } from "../../arcade/ArcadeIcon.js";
import { frameStyle } from "../../arcade/frameStyle.js";
import { portraitForSeat } from "../../branding/portraits.js";
import "./gallery.css";

// Dev-only review surface for the arcade pixel kit (Phase 2 checkpoint).
// Mock content on purpose: this route mounts outside AppProviders, so it
// must not touch auth, sockets, or the API.

// VT323 was user-selected at the Phase 2 checkpoint (2026-08-01); the
// specimen stays so future kit reviews can eyeball the type at a glance.
const FONT_CANDIDATES = [
  { label: "VT323 (--font-arcade, user-selected 2026-08-01)", family: '"VT323", monospace' },
];

const FONT_SAMPLES = [
  "ROOM BROWSER — YOUR TURN — COMMIT TURN",
  "Practice in Puzzle mode to master your strategy!",
  "0123456789 01:12 325/1000 XP tile-meld_guest-42",
];

const LONG_NAME = "ArcadeInt2GuestEtZgTtWithVeryLongName";

export function ArcadeKitGallery() {
  return (
    <main className="kit-gallery arcade-scanlines">
      <h1 className="kit-gallery-heading">Arcade kit gallery — dev only</h1>

      <h2 className="kit-gallery-section">Type specimen</h2>
      <div className="kit-gallery-fonts">
        {FONT_CANDIDATES.map((font) => (
          <section key={font.label} className="kit-gallery-font-card">
            <h3 className="kit-gallery-font-name">{font.label}</h3>
            {FONT_SAMPLES.map((sample) => (
              <p key={sample} style={{ fontFamily: font.family }} className="kit-gallery-font-sample">
                {sample}
              </p>
            ))}
          </section>
        ))}
      </div>

      <h2 className="kit-gallery-section">Panels</h2>
      <div className="kit-gallery-row">
        <ArcadePanel frame="panel-log" title="Move Log" style={{ width: 280, minHeight: 220 }}>
          <ul className="kit-gallery-log">
            <li>RICO — passed</li>
            <li>PIXIE — draw 7</li>
            <li>{LONG_NAME} — played 4 5 6</li>
          </ul>
        </ArcadePanel>
        <ArcadePanel
          frame="panel-profile"
          title="Your Profile"
          titleColor="var(--neon-gold)"
          style={{ width: 340, minHeight: 240 }}
        >
          <p>Signed in as {LONG_NAME}</p>
        </ArcadePanel>
        <ArcadePanel
          frame="panel-recovery"
          title="Recovery Access"
          titleColor="var(--neon-purple)"
          style={{ width: 340 }}
        >
          <p>Save or rotate your recovery code to get back into your games.</p>
        </ArcadePanel>
        <ArcadePanel frame="panel-turn-lcd" title="Your Turn" titleColor="var(--neon-gold)" style={{ width: 280 }}>
          <div className="kit-gallery-lcd-stack">
            <ArcadeLCD>01:12</ArcadeLCD>
            <ArcadeMeter value={0.62} label="Time remaining" />
          </div>
        </ArcadePanel>
      </div>

      <h2 className="kit-gallery-section">Plates (menu + tabletop actions)</h2>
      <div className="kit-gallery-row">
        <ArcadePlate plate="plate-menu-cyan" icon="icon-bolt" label="Play vs Computer" sublabel="Beta computer opponent" />
        <ArcadePlate plate="plate-menu-gold" icon="icon-plus-gold" label="Create Room" sublabel="Make your own room" />
        <ArcadePlate plate="plate-menu-purple" icon="icon-grid-purple" label="Join Room by Name" sublabel="Enter a room by its name" />
        <ArcadePlate plate="plate-menu-green" icon="icon-grid-green" label="Browse Public Lobby" sublabel="Find an open public room" />
        <ArcadePlate plate="plate-menu-red" icon="icon-recycle-red" label="Recovery" sublabel="Restore your recovery code" />
      </div>
      <div className="kit-gallery-row">
        <ArcadePlate plate="plate-action-cyan" icon="icon-draw-stack" label="Draw" sublabel="Draw a tile" />
        <ArcadePlate plate="plate-action-purple" icon="icon-pass-hand" label="Pass" sublabel="Pass turn" />
        <ArcadePlate plate="plate-action-dim" icon="icon-sort-tiles" label="Sort" sublabel="Sort rack" />
        <ArcadePlate plate="plate-action-orange" icon="icon-commit-arrow" label="Commit Turn" sublabel="Lock in your moves" />
        <ArcadePlate plate="plate-action-cyan" icon="icon-draw-stack" label="Disabled state" sublabel="Not your turn" disabled />
      </div>

      <h2 className="kit-gallery-section">Tiles</h2>
      <div className="kit-gallery-row kit-gallery-tiles">
        {[
          { value: 4, colorId: "C1" },
          { value: 8, colorId: "C2" },
          { value: 11, colorId: "C3" },
          { value: 9, colorId: "C4" },
          { value: 13, colorId: "C1" },
        ].map((tile, i) => (
          <ArcadeTileFace key={i} value={tile.value} colorId={tile.colorId} />
        ))}
      </div>

      <h2 className="kit-gallery-section">Competitor cards (long-name stress)</h2>
      <div className="kit-gallery-row">
        {(["gold", "purple", "pink", "green"] as PortraitCardTone[]).map((tone, i) => (
          <PortraitCard
            key={tone}
            tone={tone}
            name={i === 1 ? LONG_NAME : ["You", "Rico", "Pixie", "T-Bone"][i]}
            portraitSrc={portraitForSeat(i, false)}
          >
            <span>Score {[325, 270, 215, 180][i]}</span>
            <span>14 tiles</span>
          </PortraitCard>
        ))}
      </div>

      <h2 className="kit-gallery-section">Misc chrome</h2>
      <div className="kit-gallery-row">
        <div style={{ ...frameStyle("badge-signed-in"), padding: "0.4rem 1rem" }} className="kit-gallery-badge">
          Signed in — {LONG_NAME}
        </div>
        <div style={{ ...frameStyle("rack-band"), width: 560, minHeight: 130 }} />
        <ArcadeIcon name="button-gear" />
        <ArcadeIcon name="button-speaker" />
        <ArcadeIcon name="sprite-mascot" />
      </div>
    </main>
  );
}
