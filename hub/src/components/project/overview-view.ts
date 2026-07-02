/**
 * Pure presentation logic for the project dashboard (SPEC §18.3) — ordering,
 * grouping and labelling rules, kept free of React so they are unit-testable.
 */
import { color } from "../../design/tokens";
import type {
  OverviewCommit,
  OverviewRepo,
  OverviewRun,
  OverviewService,
  OverviewTeamMember,
} from "../../lib/types";
import { dayLabel } from "../../lib/time";

/** Pipelines order: running first, then everything by `started_at` desc. */
export function sortRuns(runs: readonly OverviewRun[]): OverviewRun[] {
  return [...runs].sort((a, b) => {
    const pa = a.status === "running" ? 0 : 1;
    const pb = b.status === "running" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return b.started_at - a.started_at;
  });
}

/** Crew order: owners first, then most recently active. */
export function crewSorted(team: readonly OverviewTeamMember[]): OverviewTeamMember[] {
  return [...team].sort((a, b) => {
    const pa = a.role === "owner" ? 0 : 1;
    const pb = b.role === "owner" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return b.last_active - a.last_active;
  });
}

export interface CommitGroup {
  /** "Today" | "Yesterday" | "12 May" (see `dayLabel`). */
  label: string;
  commits: OverviewCommit[];
}

/** Activity feed: commits sorted desc and grouped by local calendar day. */
export function groupCommits(
  commits: readonly OverviewCommit[],
  nowS: number,
): CommitGroup[] {
  const sorted = [...commits].sort((a, b) => b.at - a.at);
  const groups: CommitGroup[] = [];
  for (const c of sorted) {
    const label = dayLabel(c.at, nowS);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.commits.push(c);
    } else {
      groups.push({ label, commits: [c] });
    }
  }
  return groups;
}

/** Conventional-commit type → chip colour (established tokens only). */
export const COMMIT_TYPE_COLORS: Record<string, string> = {
  feat: color.cyan300,
  fix: color.clay,
  chore: color.muted,
  docs: color.heath,
  refactor: color.sun,
  test: color.grass,
  ci: color.cyan200,
  build: color.cyan200,
  perf: color.sun,
};

export interface ConventionalSplit {
  /** The recognised conventional-commit type, or null for free-form messages. */
  type: string | null;
  /** The message with any recognised `type(scope):` prefix stripped. */
  rest: string;
}

/** Split `feat(api): add thing` → `{ type: "feat", rest: "add thing" }`. */
export function splitConventional(message: string): ConventionalSplit {
  const m = /^([a-z]+)(\([^)]*\))?!?:\s*(.*)$/.exec(message);
  if (m && m[1] && COMMIT_TYPE_COLORS[m[1]] !== undefined && m[3]) {
    return { type: m[1], rest: m[3] };
  }
  return { type: null, rest: message };
}

/** `API · python`-style chip label for a service component. */
export function serviceChipLabel(s: OverviewService): string {
  return `${s.type.toUpperCase()} · ${s.lang}`;
}

/** One `git clone …` command per repository (monolith: one; multi-repo: several). */
export function cloneCommand(repo: OverviewRepo): string {
  return `git clone ${repo.html_url}.git`;
}

/** CODEOWNERS summary: the owners' `@login`s, in crew order. */
export function codeownersSummary(team: readonly OverviewTeamMember[]): string {
  return crewSorted(team)
    .filter((m) => m.role === "owner")
    .map((m) => `@${m.user.github_login}`)
    .join(" · ");
}

/** The 3 skills every Keel project ships with (SPEC §18.3, Day one panel). */
export const DAY_ONE_SKILLS: readonly string[] = [
  "property-based-testing",
  "python-clean-code",
  "git-ci-governance",
];

/** Branch naming rule enforced by the governance CI (mono reminder line). */
export const BRANCH_RULE = "feature|bug|hotfix/<ticket>-<slug>";
