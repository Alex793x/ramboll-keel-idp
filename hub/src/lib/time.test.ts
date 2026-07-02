import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dayLabel, formatDateLong, formatDuration, timeAgo } from "./time";

// Fixed "now": 2 July 2026, 12:00 UTC (midday, so local-date boundaries in any
// plausible CI timezone stay clear of midnight).
const NOW_S = Math.floor(Date.UTC(2026, 6, 2, 12, 0, 0) / 1000);

const MINUTE_S = 60;
const HOUR_S = 3600;
const DAY_S = 86400;
const WEEK_S = 7 * DAY_S;

describe("timeAgo", () => {
  it("returns 'just now' below the 60s boundary", () => {
    expect(timeAgo(NOW_S, NOW_S)).toBe("just now");
    expect(timeAgo(NOW_S - 59, NOW_S)).toBe("just now");
  });

  it("switches to minutes exactly at 60s", () => {
    expect(timeAgo(NOW_S - 60, NOW_S)).toBe("1m ago");
    expect(timeAgo(NOW_S - (HOUR_S - 1), NOW_S)).toBe("59m ago");
  });

  it("switches to hours exactly at 60m", () => {
    expect(timeAgo(NOW_S - HOUR_S, NOW_S)).toBe("1h ago");
    expect(timeAgo(NOW_S - (DAY_S - 1), NOW_S)).toBe("23h ago");
  });

  it("switches to days exactly at 24h", () => {
    expect(timeAgo(NOW_S - DAY_S, NOW_S)).toBe("1d ago");
    expect(timeAgo(NOW_S - (WEEK_S - 1), NOW_S)).toBe("6d ago");
  });

  it("switches to an en-GB date at 7d", () => {
    // 2 July 2026 − 51 days = 12 May 2026 (midday UTC keeps the local date stable).
    expect(timeAgo(NOW_S - 51 * DAY_S, NOW_S)).toBe("12 May 2026");
  });

  it("clamps future timestamps to 'just now'", () => {
    expect(timeAgo(NOW_S + 1, NOW_S)).toBe("just now");
    expect(timeAgo(NOW_S + 10 * DAY_S, NOW_S)).toBe("just now");
  });

  // ── fast-check properties ──────────────────────────────────────────────────

  /** Bucket rank: just now < minutes < hours < days < absolute date. */
  function bucketRank(label: string): number {
    if (label === "just now") return 0;
    if (/^\d+m ago$/.test(label)) return 1;
    if (/^\d+h ago$/.test(label)) return 2;
    if (/^\d+d ago$/.test(label)) return 3;
    return 4;
  }

  it("property: total — any past epoch yields a non-empty string", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: NOW_S }), (epochS) => {
        const label = timeAgo(epochS, NOW_S);
        expect(typeof label).toBe("string");
        expect(label.length).toBeGreaterThan(0);
      }),
    );
  });

  it("property: monotonic — an older timestamp never lands in a smaller bucket", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 * DAY_S }),
        fc.integer({ min: 0, max: 60 * DAY_S }),
        (ageA, ageB) => {
          const [younger, older] = ageA <= ageB ? [ageA, ageB] : [ageB, ageA];
          const rankYounger = bucketRank(timeAgo(NOW_S - younger, NOW_S));
          const rankOlder = bucketRank(timeAgo(NOW_S - older, NOW_S));
          expect(rankOlder).toBeGreaterThanOrEqual(rankYounger);
        },
      ),
    );
  });

  it("property: any future epoch clamps to 'just now'", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 * 365 * DAY_S }), (ahead) => {
        expect(timeAgo(NOW_S + ahead, NOW_S)).toBe("just now");
      }),
    );
  });
});

describe("formatDateLong", () => {
  it("formats an en-GB long date", () => {
    expect(formatDateLong(Math.floor(Date.UTC(2026, 4, 12, 12) / 1000))).toBe("12 May 2026");
  });
});

describe("dayLabel", () => {
  it("labels the current local day 'Today'", () => {
    expect(dayLabel(NOW_S - HOUR_S, NOW_S)).toBe("Today");
  });

  it("labels the previous local day 'Yesterday'", () => {
    expect(dayLabel(NOW_S - DAY_S, NOW_S)).toBe("Yesterday");
  });

  it("labels older days with day + month, no year", () => {
    expect(dayLabel(Math.floor(Date.UTC(2026, 4, 12, 12) / 1000), NOW_S)).toBe("12 May");
  });

  it("property: every label is Today, Yesterday, or a day-month date", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 90 * DAY_S }), (age) => {
        const label = dayLabel(NOW_S - age, NOW_S);
        expect(
          label === "Today" || label === "Yesterday" || /^\d{1,2} [A-Z][a-z]+$/.test(label),
        ).toBe(true);
      }),
    );
  });
});

describe("formatDuration", () => {
  it("formats seconds below a minute", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("formats minutes and seconds below an hour", () => {
    expect(formatDuration(60)).toBe("1m 0s");
    expect(formatDuration(272)).toBe("4m 32s");
    expect(formatDuration(HOUR_S - 1)).toBe("59m 59s");
  });

  it("formats hours and minutes from an hour up", () => {
    expect(formatDuration(HOUR_S)).toBe("1h 0m");
    expect(formatDuration(HOUR_S + 4 * MINUTE_S + 5)).toBe("1h 4m");
  });

  it("clamps negative input to 0s", () => {
    expect(formatDuration(-3)).toBe("0s");
  });
});
