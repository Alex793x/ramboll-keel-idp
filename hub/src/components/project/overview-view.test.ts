/**
 * Pure presentation-logic tests for the dashboard (ordering, grouping,
 * conventional-commit parsing) — property-checked where order matters.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { OverviewCommit, OverviewRun, OverviewTeamMember } from "../../lib/types";
import {
  cloneCommand,
  codeownersSummary,
  crewSorted,
  groupCommits,
  serviceChipLabel,
  sortRuns,
  splitConventional,
} from "./overview-view";

const NOW_S = Math.floor(Date.UTC(2026, 6, 2, 12, 0, 0) / 1000);

const runArb: fc.Arbitrary<OverviewRun> = fc.record({
  id: fc.uuid(),
  workflow: fc.constantFrom("build", "test", "validate", "gate" as const),
  branch: fc.constant("dev"),
  status: fc.constantFrom("running", "queued", "passed", "failed" as const),
  started_at: fc.integer({ min: 0, max: NOW_S }),
  duration_s: fc.option(fc.integer({ min: 0, max: 5000 }), { nil: null }),
  triggered_by: fc.constant("joe-evans"),
  trigger_sha: fc.constant("abc1234"),
});

describe("sortRuns", () => {
  it("property: every running run precedes every non-running run", () => {
    fc.assert(
      fc.property(fc.array(runArb, { maxLength: 20 }), (runs) => {
        const sorted = sortRuns(runs);
        const lastRunning = sorted.map((r) => r.status).lastIndexOf("running");
        const firstOther = sorted.findIndex((r) => r.status !== "running");
        if (lastRunning !== -1 && firstOther !== -1) {
          expect(lastRunning).toBeLessThan(firstOther);
        }
        // Within each class, started_at is descending.
        for (let i = 1; i < sorted.length; i++) {
          const a = sorted[i - 1]!;
          const b = sorted[i]!;
          if ((a.status === "running") === (b.status === "running")) {
            expect(a.started_at).toBeGreaterThanOrEqual(b.started_at);
          }
        }
        // Sorting never loses or invents runs.
        expect(sorted).toHaveLength(runs.length);
      }),
    );
  });

  it("does not mutate its input", () => {
    const runs: OverviewRun[] = [
      { id: "a", workflow: "build", branch: "dev", status: "passed", started_at: 5, duration_s: 10, triggered_by: "x", trigger_sha: "s" },
      { id: "b", workflow: "test", branch: "dev", status: "running", started_at: 1, duration_s: null, triggered_by: "x", trigger_sha: "s" },
    ];
    sortRuns(runs);
    expect(runs.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("crewSorted", () => {
  it("puts owners first, then contributors by last_active desc", () => {
    const member = (
      id: string,
      role: OverviewTeamMember["role"],
      lastActive: number,
    ): OverviewTeamMember => ({
      user: { id, name: id, github_login: id, chapter: "DPE" },
      role,
      active_branch: null,
      last_active: lastActive,
    });
    const sorted = crewSorted([
      member("c-old", "contributor", 10),
      member("owner", "owner", 5),
      member("c-new", "contributor", 20),
    ]);
    expect(sorted.map((m) => m.user.id)).toEqual(["owner", "c-new", "c-old"]);
  });
});

describe("groupCommits", () => {
  const commit = (sha: string, at: number): OverviewCommit => ({
    sha,
    message: "feat: x",
    author: { name: "Joe Evans", github_login: "joe-evans" },
    branch: "dev",
    at,
  });

  it("groups by local day, newest group first, commits desc inside", () => {
    const groups = groupCommits(
      [commit("old", NOW_S - 51 * 86400), commit("b", NOW_S - 7200), commit("a", NOW_S - 3600)],
      NOW_S,
    );
    expect(groups.map((g) => g.label)).toEqual(["Today", "12 May"]);
    expect(groups[0]!.commits.map((c) => c.sha)).toEqual(["a", "b"]);
  });

  it("property: grouping preserves every commit exactly once, sorted desc", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: NOW_S }), { maxLength: 30 }),
        (ats) => {
          const commits = ats.map((at, i) => commit(`sha-${i}`, at));
          const groups = groupCommits(commits, NOW_S);
          const flat = groups.flatMap((g) => g.commits);
          expect(flat).toHaveLength(commits.length);
          for (let i = 1; i < flat.length; i++) {
            expect(flat[i - 1]!.at).toBeGreaterThanOrEqual(flat[i]!.at);
          }
        },
      ),
    );
  });
});

describe("splitConventional", () => {
  it("recognises type and scope prefixes", () => {
    expect(splitConventional("feat: add thing")).toEqual({ type: "feat", rest: "add thing" });
    expect(splitConventional("fix(rounding): clamp loads")).toEqual({
      type: "fix",
      rest: "clamp loads",
    });
    expect(splitConventional("chore!: drop node 18")).toEqual({
      type: "chore",
      rest: "drop node 18",
    });
  });

  it("leaves free-form and unknown-type messages intact", () => {
    expect(splitConventional("Initial commit")).toEqual({ type: null, rest: "Initial commit" });
    expect(splitConventional("wip: stuff")).toEqual({ type: null, rest: "wip: stuff" });
  });
});

describe("labels and commands", () => {
  it("serviceChipLabel formats `API · python`", () => {
    expect(
      serviceChipLabel({ dir: "services/api", type: "api", lang: "python", name: "x-api" }),
    ).toBe("API · python");
  });

  it("cloneCommand appends .git to the repo url", () => {
    expect(
      cloneCommand({ name: "x", html_url: "https://github.com/ramboll/x", default_branch: "main" }),
    ).toBe("git clone https://github.com/ramboll/x.git");
  });

  it("codeownersSummary lists owner logins only", () => {
    const owner: OverviewTeamMember = {
      user: { id: "u-joe", name: "Joe Evans", github_login: "joe-evans", chapter: "DPE" },
      role: "owner",
      active_branch: null,
      last_active: 0,
    };
    const contributor: OverviewTeamMember = {
      ...owner,
      user: { ...owner.user, id: "u-mansi", github_login: "mansi-gautam" },
      role: "contributor",
    };
    expect(codeownersSummary([contributor, owner])).toBe("@joe-evans");
  });
});
