import type { ReactNode } from "react";
import { frameStyle } from "./frameStyle.js";
import type { ArcadeAssetName } from "../assets/arcade/manifest.js";

const CARD_BY_TONE = {
  gold: "card-competitor-gold",
  purple: "card-competitor-purple",
  pink: "card-competitor-pink",
  green: "card-competitor-green",
} as const satisfies Record<string, ArcadeAssetName>;

export type PortraitCardTone = keyof typeof CARD_BY_TONE;

interface PortraitCardProps {
  tone: PortraitCardTone;
  /** Player name; live text in the header band (accessible name unchanged). */
  name: ReactNode;
  portraitSrc: string;
  portraitAlt?: string;
  /** Right-hand body content (score, tile count, status). */
  children?: ReactNode;
  className?: string;
}

/**
 * Competitor card from the concept: per-tone sliced frame, live name header,
 * pixelated portrait in a CSS-bevel window, live stats body.
 */
export function PortraitCard({
  tone,
  name,
  portraitSrc,
  portraitAlt = "",
  children,
  className,
}: PortraitCardProps) {
  return (
    <div
      className={
        className
          ? `arcade-kit-card arcade-kit-card--${tone} ${className}`
          : `arcade-kit-card arcade-kit-card--${tone}`
      }
      style={frameStyle(CARD_BY_TONE[tone])}
    >
      <div className="arcade-kit-card-name">{name}</div>
      <div className="arcade-kit-card-body">
        <span className="arcade-kit-card-window">
          <img
            src={portraitSrc}
            alt={portraitAlt}
            draggable={false}
            className="arcade-kit-card-portrait"
          />
        </span>
        <div className="arcade-kit-card-stats">{children}</div>
      </div>
    </div>
  );
}
