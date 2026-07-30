import type { ArtRequirement } from "../tabletop-concept/artRequirements.js";
import { portraitForSeat } from "../../branding/portraits.js";
import { resolveAssetUrl } from "./resolveAssets.js";

const MOCK_TILES: readonly { readonly value: number; readonly color: string }[] = [
  { value: 4, color: "#B3261E" },
  { value: 5, color: "#1957A6" },
  { value: 9, color: "#256B37" },
];

function MissingBox({ req }: { readonly req: ArtRequirement }) {
  const biggest = req.renderedDimensions.reduce(
    (max, d) => (d.width * d.height > max.width * max.height ? d : max),
    req.renderedDimensions[0]!,
  );
  // A floor, not just a cap -- some assets (e.g. the mascot icon) render
  // small enough (48x48) that the NOT SUPPLIED label text wouldn't fit
  // without one.
  const w = Math.min(Math.max(biggest.width, 160), 320);
  const h = Math.min(Math.max(biggest.height, 110), 220);
  return (
    <div className="asset-missing-box" style={{ width: w, height: h }}>
      <strong>NOT SUPPLIED</strong>
      <span>{req.filename}</span>
      <span>
        {req.sourceDimensions.width}×{req.sourceDimensions.height} {req.format} ·{" "}
        {req.transparency === "required" ? "transparent" : req.transparency}
      </span>
      {req.nineSliceInsets && (
        <span>
          9-slice T{req.nineSliceInsets.top}/R{req.nineSliceInsets.right}/B
          {req.nineSliceInsets.bottom}/L{req.nineSliceInsets.left}
        </span>
      )}
    </div>
  );
}

function PreviewContent({ req, url }: { readonly req: ArtRequirement; readonly url: string }) {
  const dims = req.renderedDimensions[0] ?? { width: 200, height: 100 };
  const style = { width: dims.width, height: dims.height };

  if (req.group === "competitor") {
    return (
      <div className="preview-composite" style={style}>
        <img className="frame-bg" src={url} alt="" />
        <div className="preview-composite-content">
          <img className="preview-portrait" src={portraitForSeat(1, false)} alt="" />
          <span style={{ fontSize: "0.7rem" }}>RICO</span>
          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Score 270</span>
        </div>
      </div>
    );
  }

  if (req.group === "board" || req.group === "rack") {
    return (
      <div className="preview-composite" style={style}>
        <img className="frame-bg" src={url} alt="" />
        <div className="preview-composite-content">
          {MOCK_TILES.map((t, i) => (
            <span className="preview-tile" style={{ color: t.color }} key={i}>
              {t.value}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (req.group === "sidebar") {
    return (
      <div className="preview-composite" style={style}>
        <img className="frame-bg" src={url} alt="" />
        <div className="preview-composite-content">
          <span style={{ fontSize: "0.65rem", color: "var(--neon-cyan)" }}>YOUR TURN</span>
          <span style={{ fontSize: "1rem", color: "var(--neon-gold)" }}>01:12</span>
        </div>
      </div>
    );
  }

  if (req.group === "action") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <button
          className="preview-button"
          style={{ ...style, backgroundImage: `url(${url})`, backgroundSize: "100% 100%" }}
        >
          <span style={{ fontSize: "0.7rem", color: "var(--neon-gold)" }}>Commit Turn</span>
        </button>
        <span className="preview-focus-hint">
          Real &lt;button&gt; -- press Tab to check focus outline
        </span>
      </div>
    );
  }

  // masthead / chrome -- plain contain preview, no composite content.
  return (
    <div className="preview-composite" style={style}>
      <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </div>
  );
}

export function AssetSlotCard({ req }: { readonly req: ArtRequirement }) {
  const url = resolveAssetUrl(req.filename);
  const exists = url !== undefined;

  return (
    <div className={`asset-card${req.priority === "required" ? " asset-card--required" : ""}`}>
      <div className="asset-card-head">
        <h3 className="asset-card-title">{req.title}</h3>
        <div style={{ display: "flex", gap: 4 }}>
          <span className={`asset-card-badge asset-card-badge--${req.priority}`}>
            {req.priority}
          </span>
          <span
            className={`asset-card-badge ${exists ? "asset-card-badge--exists" : "asset-card-badge--missing"}`}
          >
            {exists ? "supplied" : "not supplied"}
          </span>
        </div>
      </div>

      <dl className="asset-card-meta">
        <dt>id</dt>
        <dd>{req.id}</dd>
        <dt>file</dt>
        <dd>{req.filename}</dd>
        <dt>layouts</dt>
        <dd>{req.layouts.join(", ")}</dd>
        <dt>source</dt>
        <dd>
          {req.sourceDimensions.width}×{req.sourceDimensions.height} {req.format}
        </dd>
        <dt>rendered</dt>
        <dd>
          {req.renderedDimensions.map((d) => `${d.layout} ${d.width}×${d.height}`).join(" · ")}
        </dd>
        <dt>transparency</dt>
        <dd>{req.transparency}</dd>
        <dt>stretch</dt>
        <dd>{req.stretchMode}</dd>
        {req.nineSliceInsets && (
          <>
            <dt>9-slice</dt>
            <dd>
              T{req.nineSliceInsets.top} R{req.nineSliceInsets.right} B{req.nineSliceInsets.bottom}{" "}
              L{req.nineSliceInsets.left}
            </dd>
          </>
        )}
        {req.safeContentArea && (
          <>
            <dt>safe area</dt>
            <dd>
              {req.safeContentArea.width}×{req.safeContentArea.height} @ ({req.safeContentArea.x},
              {req.safeContentArea.y})
            </dd>
          </>
        )}
        <dt>consumer</dt>
        <dd>{req.consumer}</dd>
        <dt>max size</dt>
        <dd>{Math.round(req.maxBytes / 1000)} KB</dd>
      </dl>

      <div className="asset-preview">
        {exists ? <PreviewContent req={req} url={url} /> : <MissingBox req={req} />}
      </div>

      <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", margin: 0 }}>{req.notes}</p>
    </div>
  );
}
