import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import { frameStyle } from "./frameStyle.js";
import type { ArcadeAssetName } from "../assets/arcade/manifest.js";
import { ArcadeIcon } from "./ArcadeIcon.js";

interface PlateContentProps {
  icon?: ArcadeAssetName | undefined;
  iconScale?: number | undefined;
  label: ReactNode;
  sublabel?: ReactNode | undefined;
}

function PlateContent({ icon, iconScale = 1, label, sublabel }: PlateContentProps) {
  return (
    <>
      {icon && <ArcadeIcon name={icon} scale={iconScale} className="arcade-kit-plate-icon" />}
      <span className="arcade-kit-plate-text">
        <span className="arcade-kit-plate-label">{label}</span>
        {/* aria-hidden keeps the control's accessible name exactly the
            label (tests and SC 2.5.3 Label in Name both depend on it);
            the sublabel is a visual hint only. */}
        {sublabel !== undefined && (
          <span className="arcade-kit-plate-sub" aria-hidden="true">
            {sublabel}
          </span>
        )}
      </span>
    </>
  );
}

interface ArcadePlateProps
  extends PlateContentProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** 9-sliced plate asset, e.g. "plate-menu-cyan", "plate-action-orange". */
  plate: ArcadeAssetName;
}

/**
 * A concept-art button plate. The chrome is sliced concept art; the icon is
 * decorative; the label/sublabel are live text, so the accessible name is
 * exactly the visible label (visual all-caps comes from CSS text-transform).
 */
export function ArcadePlate({
  plate,
  icon,
  iconScale,
  label,
  sublabel,
  className,
  type = "button",
  ...buttonProps
}: ArcadePlateProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={className ? `arcade-kit-plate ${className}` : "arcade-kit-plate"}
      style={frameStyle(plate)}
    >
      <PlateContent icon={icon} iconScale={iconScale} label={label} sublabel={sublabel} />
    </button>
  );
}

interface ArcadePlateLinkProps extends PlateContentProps {
  plate: ArcadeAssetName;
  to: string;
  className?: string;
}

/** Link-flavored plate for navigation actions (same chrome, real <a>). */
export function ArcadePlateLink({
  plate,
  to,
  icon,
  iconScale,
  label,
  sublabel,
  className,
}: ArcadePlateLinkProps) {
  return (
    <Link
      to={to}
      className={className ? `arcade-kit-plate ${className}` : "arcade-kit-plate"}
      style={frameStyle(plate)}
    >
      <PlateContent icon={icon} iconScale={iconScale} label={label} sublabel={sublabel} />
    </Link>
  );
}
