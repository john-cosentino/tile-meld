// Original, simple geometric action-bar icons (stroke-based, currentColor)
// -- replaces the earlier emoji placeholders per the refinement brief
// ("do not use Unicode emoji as the final button icons... must not copy
// another game"). Deliberately plain/abstract: a card stack, a raised
// palm, ascending bars, a checkmark -- generic strategy-game glyphs, not
// a likeness of any existing game's iconography.

const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none" } as const;

export function DrawIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <rect
        x="6"
        y="8"
        width="14"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <rect
        x="3"
        y="5"
        width="14"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}

export function PassIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <path
        d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V13M17 8.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.4L4 14.8c-.6-1-.3-2 .5-2.4.7-.4 1.6-.2 2.2.6l1.3 1.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SortIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <rect x="3" y="5" width="8" height="3" rx="1" fill="currentColor" />
      <rect x="3" y="10.5" width="13" height="3" rx="1" fill="currentColor" />
      <rect x="3" y="16" width="18" height="3" rx="1" fill="currentColor" />
    </svg>
  );
}

export function CommitIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2" fill="none" />
      <path
        d="M7.5 12.5l3 3 6-6.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
