type ActionSpec = {
  readonly icon: string;
  readonly label: string;
  readonly sublabel: string;
  readonly variant: "cyan" | "purple" | "gold";
};

const ACTIONS: readonly ActionSpec[] = [
  { icon: "🂠", label: "Draw", sublabel: "Draw a tile", variant: "cyan" },
  { icon: "✋", label: "Pass", sublabel: "Pass turn", variant: "purple" },
  { icon: "🔢", label: "Sort", sublabel: "Sort rack", variant: "cyan" },
  { icon: "➤", label: "Commit Turn", sublabel: "Lock in your moves", variant: "gold" },
];

/**
 * Static prototype controls only -- plain non-interactive <div>s (no
 * onClick, no <button>), matching the brief's "do not need to function...
 * must not look like ordinary HTML form buttons."
 */
export function ConceptActionBar() {
  return (
    <div className="concept-panel concept-actions" aria-hidden="true">
      {ACTIONS.map((a) => (
        <div className={`concept-action-button concept-action-button--${a.variant}`} key={a.label}>
          <span className="concept-action-icon">{a.icon}</span>
          <span className="concept-action-label">{a.label}</span>
          <span className="concept-action-sublabel">{a.sublabel}</span>
        </div>
      ))}
    </div>
  );
}
