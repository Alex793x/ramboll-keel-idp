import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  PROJECTS,
  RECS,
  UPDATES,
  WORK_STATS,
  dateLine,
  greetingFor,
  statusChipStyle,
} from "./hub-data";

describe("statusChipStyle", () => {
  it.each([
    ["Healthy", "rgba(173,208,149,0.12)", "#ADD095"],
    ["Warning", "rgba(255,230,130,0.12)", "#FFE682"],
    ["Critical", "rgba(255,136,85,0.14)", "#FF8855"],
    ["Experimental", "rgba(224,212,219,0.12)", "#C0A9B7"],
  ] as const)("maps %s to the design colours", (status, bg, fg) => {
    expect(statusChipStyle(status)).toEqual({
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      width: "fit-content",
      padding: "4px 11px",
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 700,
      background: bg,
      color: fg,
    });
  });
});

describe("greetingFor", () => {
  it("honours the band boundaries", () => {
    expect(greetingFor(0)).toBe("Good night");
    expect(greetingFor(4)).toBe("Good night");
    expect(greetingFor(5)).toBe("Good morning");
    expect(greetingFor(11)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(17)).toBe("Good afternoon");
    expect(greetingFor(18)).toBe("Good evening");
    expect(greetingFor(23)).toBe("Good evening");
  });

  it("always yields one of the four greetings, constant within each band", () => {
    const bands = [
      { lo: 0, hi: 4, greeting: "Good night" },
      { lo: 5, hi: 11, greeting: "Good morning" },
      { lo: 12, hi: 17, greeting: "Good afternoon" },
      { lo: 18, hi: 23, greeting: "Good evening" },
    ];
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23 }), (hour) => {
        const result = greetingFor(hour);
        const band = bands.find((b) => hour >= b.lo && hour <= b.hi);
        expect(band).toBeDefined();
        expect(result).toBe(band?.greeting);
      }),
    );
  });

  it("is monotone by band: greetings only advance as the hour grows", () => {
    const order = ["Good night", "Good morning", "Good afternoon", "Good evening"];
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 23 }),
        (a, b) => {
          const [earlier, later] = a <= b ? [a, b] : [b, a];
          expect(order.indexOf(greetingFor(earlier))).toBeLessThanOrEqual(
            order.indexOf(greetingFor(later)),
          );
        },
      ),
    );
  });
});

describe("dateLine", () => {
  it("formats en-GB long-form and uppercases", () => {
    // 2 July 2026 is a Thursday. ICU builds differ on the comma after the
    // weekday, so accept both renderings.
    const line = dateLine(new Date(2026, 6, 2));
    expect(line).toMatch(/^THURSDAY,? 2 JULY 2026$/);
    expect(line).toBe(line.toUpperCase());
  });

  it("uses numeric day (no zero padding)", () => {
    expect(dateLine(new Date(2026, 0, 5))).toMatch(/^MONDAY,? 5 JANUARY 2026$/);
  });
});

describe("PROJECTS", () => {
  it("contains exactly the six design rows", () => {
    expect(PROJECTS).toHaveLength(6);
    expect(PROJECTS.map((p) => p.id)).toEqual([
      "RMB-EN-017",
      "RMB-MC-024",
      "RMB-WA-031",
      "RMB-TR-008",
      "RMB-EN-042",
      "RMB-WA-012",
    ]);
  });

  it("has unique ids matching the RMB catalog pattern", () => {
    const ids = PROJECTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^RMB-[A-Z]{2}-\d{3}$/);
    }
  });

  it("only uses statuses the chip styler knows", () => {
    const known = new Set(["Healthy", "Warning", "Critical", "Experimental"]);
    for (const p of PROJECTS) {
      expect(known.has(p.status)).toBe(true);
    }
  });
});

describe("home fixtures", () => {
  it("ships the four work stats verbatim", () => {
    expect(WORK_STATS).toEqual([
      { n: 3, label: "PRs awaiting your review", dot: "#66C1F3" },
      { n: 2, label: "Failing builds", dot: "#FF8855" },
      { n: 1, label: "Deployment pending approval", dot: "#FFE682" },
      { n: 4, label: "Assigned tickets", dot: "#9BADC5" },
    ]);
  });

  it("ships the three platform updates and three recommendations", () => {
    expect(UPDATES.map((u) => [u.title, u.meta, u.dot])).toEqual([
      ["New Azure deployment golden path available", "PLATFORM · 2D AGO", "#0098EB"],
      ["GitHub Actions template v3 released", "CI/CD · 4D AGO", "#ADD095"],
      ["Security policy update effective 12 July", "GOVERNANCE · 1W AGO", "#FFE682"],
    ]);
    expect(RECS).toEqual([
      "Add CODEOWNERS to groundwater-twin-api",
      "Update deprecated dependency in emissions-calculator-fe",
      "Review API documentation for customer-data-api",
    ]);
  });
});
