import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";

type DropZoneProps = {
  readonly id: string;
  readonly label: string;
  readonly children: ReactNode;
  readonly validity?: "valid" | "invalid" | "neutral";
  /** True while a tile is selected via click/tap (not drag) -- lets the
   * zone announce itself as an available destination for keyboard/tap
   * users the same way drag-hover does for pointer users. */
  readonly selectable?: boolean;
  readonly onActivate?: () => void;
};

export function DropZone({
  id,
  label,
  children,
  validity = "neutral",
  selectable,
  onActivate,
}: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const classes = ["drop-zone"];
  if (isOver) classes.push("is-over");
  if (validity === "valid") classes.push("valid");
  if (validity === "invalid") classes.push("invalid");

  return (
    <div
      ref={setNodeRef}
      role={selectable ? "button" : "group"}
      aria-label={label}
      tabIndex={selectable ? 0 : undefined}
      onClick={selectable ? onActivate : undefined}
      onKeyDown={
        selectable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivate?.();
              }
            }
          : undefined
      }
      className={classes.join(" ")}
    >
      {children}
    </div>
  );
}
