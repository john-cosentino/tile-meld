import type { ReactNode } from "react";
import { frameStyle } from "./frameStyle.js";

interface ArcadeLCDProps {
  /** Live LCD content (e.g. a countdown), rendered in the arcade font. */
  children: ReactNode;
  className?: string;
}

/** The concept's dark LCD screen inset with live glowing digits. */
export function ArcadeLCD({ children, className }: ArcadeLCDProps) {
  return (
    <span
      className={className ? `arcade-kit-lcd ${className}` : "arcade-kit-lcd"}
      style={frameStyle("lcd-screen")}
    >
      {children}
    </span>
  );
}
