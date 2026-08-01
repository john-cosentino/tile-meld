import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { frameStyle } from "./frameStyle.js";
import type { ArcadeAssetName } from "../assets/arcade/manifest.js";

type HeadingLevel = "h1" | "h2" | "h3";

interface ArcadePanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** 9-sliced frame asset, e.g. "panel-log", "panel-profile". */
  frame: ArcadeAssetName;
  /** Live-text panel title, rendered top-center in the arcade font. */
  title?: string | undefined;
  /** Heading element for the title (default h2). */
  as?: HeadingLevel | undefined;
  /** Title color token, e.g. "var(--neon-gold)"; defaults to the frame's accent via CSS. */
  titleColor?: string | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  children?: ReactNode | undefined;
  /** Set when the body can scroll (overflow-y auto in CSS): makes the
   * scroll container keyboard-focusable (axe scrollable-region-focusable). */
  scrollable?: boolean | undefined;
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
  scrollable,
  ...rest
}: ArcadePanelProps) {
  return (
    <section
      {...rest}
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
      <div className="arcade-kit-panel-body" tabIndex={scrollable ? 0 : undefined}>
        {children}
      </div>
    </section>
  );
}
