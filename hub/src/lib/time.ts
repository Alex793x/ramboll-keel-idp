/**
 * Pure time formatting for the project dashboard (SPEC §18). The wire contract
 * ships unix epoch SECONDS; every helper here takes `(epochS, nowS)` pairs so
 * the formatting is deterministic and unit-testable — no hidden `Date.now()`.
 *
 * Buckets for {@link timeAgo} (SPEC §18.1):
 *   < 60s        → "just now"      (future timestamps clamp here too)
 *   < 60m        → "4m ago"
 *   < 24h        → "2h ago"
 *   < 7d         → "3d ago"
 *   otherwise    → "12 May 2026"   (en-GB long date)
 */

const MINUTE_S = 60;
const HOUR_S = 3600;
const DAY_S = 86400;
const WEEK_S = 7 * DAY_S;

/** Relative age of `epochS` as seen from `nowS`. Future values clamp to "just now". */
export function timeAgo(epochS: number, nowS: number): string {
  const diff = nowS - epochS;
  if (diff < MINUTE_S) return "just now";
  if (diff < HOUR_S) return `${Math.floor(diff / MINUTE_S)}m ago`;
  if (diff < DAY_S) return `${Math.floor(diff / HOUR_S)}h ago`;
  if (diff < WEEK_S) return `${Math.floor(diff / DAY_S)}d ago`;
  return formatDateLong(epochS);
}

/** `12 May 2026` — en-GB long date, used by provenance lines and old timestamps. */
export function formatDateLong(epochS: number): string {
  return new Date(epochS * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Day-group label for the Activity feed: "Today", "Yesterday", or `12 May`
 * (en-GB, no year — the feed only reaches back days, per SPEC §18.3).
 * Calendar-day comparison happens in local time, like the rest of the hub.
 */
export function dayLabel(epochS: number, nowS: number): string {
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const diffDays = Math.round(
    (startOfDay(nowS * 1000) - startOfDay(epochS * 1000)) / (DAY_S * 1000),
  );
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Date(epochS * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
}

/**
 * Compact duration for pipeline runs: `45s`, `4m 12s`, `1h 4m`.
 * Negative inputs clamp to `0s` (a run can never take negative time).
 */
export function formatDuration(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  if (s < MINUTE_S) return `${s}s`;
  if (s < HOUR_S) return `${Math.floor(s / MINUTE_S)}m ${s % MINUTE_S}s`;
  return `${Math.floor(s / HOUR_S)}h ${Math.floor((s % HOUR_S) / MINUTE_S)}m`;
}
