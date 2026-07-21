// A small, pure, testable "N minutes/hours/days ago" formatter for the
// dashboard's "last activity" line. `now` is an explicit parameter (rather
// than reading Date.now() internally) purely so tests can pass a fixed
// instant instead of racing the real clock -- app code is free to omit it
// and let it default.

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const diffMs = Math.max(0, now - then);
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
