import { coverStyle } from "./frameStyle.js";

interface ArcadeMeterProps {
  /** Fill fraction 0..1. */
  value: number;
  /** Accessible label; rendered for screen readers, meter itself is visual. */
  label: string;
  className?: string;
}

/**
 * Segmented progress meter from the concept art: the track is the sliced
 * meter art, the fill is a live overlay clipped to the value.
 */
export function ArcadeMeter({ value, label, className }: ArcadeMeterProps) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <span
      className={className ? `arcade-kit-meter ${className}` : "arcade-kit-meter"}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-label={label}
      style={coverStyle("meter-segment")}
    >
      <span className="arcade-kit-meter-fill" style={{ width: `${clamped * 100}%` }} />
    </span>
  );
}
