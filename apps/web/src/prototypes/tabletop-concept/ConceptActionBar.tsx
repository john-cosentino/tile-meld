import type { ComponentType } from "react";
import { DrawIcon, PassIcon, SortIcon, CommitIcon } from "./ConceptIcons.js";

type ActionSpec = {
  readonly Icon: ComponentType;
  readonly label: string;
  readonly sublabel: string;
  readonly variant: "cyan" | "purple" | "gold";
};

const ACTIONS: readonly ActionSpec[] = [
  { Icon: DrawIcon, label: "Draw", sublabel: "Draw a tile", variant: "cyan" },
  { Icon: PassIcon, label: "Pass", sublabel: "Pass turn", variant: "purple" },
  { Icon: SortIcon, label: "Sort", sublabel: "Sort rack", variant: "cyan" },
  { Icon: CommitIcon, label: "Commit Turn", sublabel: "Lock in your moves", variant: "gold" },
];

/**
 * Static prototype controls only -- plain non-interactive <div>s (no
 * onClick, no <button>), matching the brief's "do not need to function...
 * must not look like ordinary HTML form buttons." Shared across all three
 * layouts (desktop/phone-portrait/phone-landscape); each layout's own CSS
 * controls sizing/grid arrangement via the surrounding .concept-actions
 * container.
 */
export function ConceptActionBar() {
  return (
    <div className="concept-panel concept-actions" aria-hidden="true">
      {ACTIONS.map((a) => (
        <div className={`concept-action-button concept-action-button--${a.variant}`} key={a.label}>
          <span className="concept-action-icon">
            <a.Icon />
          </span>
          <span className="concept-action-label">{a.label}</span>
          <span className="concept-action-sublabel">{a.sublabel}</span>
        </div>
      ))}
    </div>
  );
}
