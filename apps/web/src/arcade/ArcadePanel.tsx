import type { CSSProperties, ReactNode } from "react";
import { frameStyle } from "./frameStyle.js";
import type { ArcadeAssetName } from "../assets/arcade/manifest.js";

type HeadingLevel = "h1" | "h2" | "h3";

interface ArcadePanelProps {
  /** 9-sliced frame asset, e.g. "panel-log", "panel-profile". */
  frame: ArcadeAssetName;
  /** Live-text panel title, rendered top-center in the arcade font. */
  title?: string;
  /** Heading element for the title (default h2). */
  as?: HeadingLevel;
  /** Title color token, e.g. "var(--neon-gold)"; defaults to the frame's accent via CSS. */
  titleColor?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * A framed concept-art panel. The frame chrome comes from the sliced
 * concept PNG; the title and body are always live HTML on the flattened
 * interior (text is never baked into artwork).
 */
export function ArcadePanel({
  frame,
  title,
  as: Heading = "h2",
  titleColor,
  className,
  style,
  children,
}: ArcadePanelProps) {
  return (
    <section
      className={className ? `arcade-kit-panel ${className}` : "arcade-kit-panel"}
      style={{ ...frameStyle(frame), ...style }}
    >
      {title !== undefined && (
        <Heading
          className="arcade-kit-panel-title"
          style={titleColor ? { color: titleColor } : undefined}
        >
          {title}
        </Heading>
      )}
      <div className="arcade-kit-panel-body">{children}</div>
    </section>
  );
}
