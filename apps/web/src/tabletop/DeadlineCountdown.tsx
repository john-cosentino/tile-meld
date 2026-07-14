import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "overdue";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

export function DeadlineCountdown({ deadlineAt }: { readonly deadlineAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!deadlineAt) return null;
  const remaining = new Date(deadlineAt).getTime() - now;
  const warning = remaining <= 15 * 60 * 1000;
  return (
    <span
      className={warning ? "error-banner" : "muted"}
      style={{ padding: warning ? "var(--space-1) var(--space-2)" : undefined }}
    >
      {formatRemaining(remaining)}
    </span>
  );
}
