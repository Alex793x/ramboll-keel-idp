/**
 * ProjectScreen tests — mocked fetch (WizardScreen idiom), mocked router, and
 * a mocked FlowPanel so this suite never depends on BranchFlow internals
 * (SPEC §18.4: the flow/ area belongs to another agent).
 *
 * `fixtureOverview()` satisfies every §18.2 invariant: one rail each of
 * main/staging/dev (ahead 0), working branches matching
 * `^(feature|bug|hotfix)/[a-z0-9]+(-[a-z0-9]+)*$` with ahead ≥ 1, feeds
 * sorted desc with `at ≤ now`, `duration_s = null ⇔ running|queued`, and each
 * branch's `ci` equal to the status of its latest run.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { CSSProperties, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeelApi } from "../../lib/api";
import type { OverviewPerson, ProjectOverview } from "../../lib/types";
import { HomeScreen } from "../home/HomeScreen";
import { ProjectsScreen } from "../projects/ProjectsScreen";
import { ProjectScreen } from "./ProjectScreen";

// ── Router + FlowPanel mocks ─────────────────────────────────────────────────

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  Link: ({
    to,
    children,
    className,
    style,
  }: {
    to: string;
    children?: ReactNode;
    className?: string;
    style?: CSSProperties;
  }) => (
    <a href={to} className={className} style={style}>
      {children}
    </a>
  ),
}));

vi.mock("./FlowPanel", () => ({
  FlowPanel: ({ branches }: { branches: unknown[] }) => (
    <div data-testid="flow-stub">{branches.length} branches</div>
  ),
}));

// ── Fixture (typed, §18.2-invariant-clean) ───────────────────────────────────

/** Fixed "now": 2 July 2026, 12:00 UTC (midday — local-day-boundary safe). */
const NOW_MS = Date.UTC(2026, 6, 2, 12, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);
const HOUR_S = 3600;
const DAY_S = 86400;

const joe: OverviewPerson = {
  id: "u-joe",
  name: "Joe Evans",
  github_login: "joe-evans",
  chapter: "Developer Platform Engineering",
};
const mansi: OverviewPerson = {
  id: "u-mansi",
  name: "Mansi Gautam",
  github_login: "mansi-gautam",
  chapter: "Developer Platform Engineering",
};
const simon: OverviewPerson = {
  id: "u-simon",
  name: "Simon Scott Siedler",
  github_login: "simon-siedler",
  chapter: "Developer Platform Engineering",
};

function fixtureOverview(): ProjectOverview {
  return {
    project: {
      id: "RMB-EN-042",
      name: "District Heating Optimizer",
      description: "Forecast-driven load balancing for DK networks",
      gba: "Energy",
      status: "Healthy",
      layout: "monolith",
      services: [
        { dir: "services/api", type: "api", lang: "python", name: "district-heating-optimizer-api" },
        { dir: "services/fe", type: "fe", lang: "react", name: "district-heating-optimizer-fe" },
      ],
      initialized_by: joe,
      // 2 July 2026 − 51 days = 12 May 2026.
      initialized_at: NOW_S - 51 * DAY_S,
      blueprint: "api-python",
      blueprint_version: "2.1.0",
      repos: [
        {
          name: "district-heating-optimizer",
          html_url: "https://github.com/ramboll/district-heating-optimizer",
          default_branch: "main",
        },
      ],
    },
    // Contributors deliberately listed BEFORE the owner: the Crew panel must sort.
    team: [
      {
        user: mansi,
        role: "contributor",
        active_branch: "feature/dh-114-load-forecast",
        last_active: NOW_S - HOUR_S,
      },
      { user: simon, role: "contributor", active_branch: null, last_active: NOW_S - 2 * DAY_S },
      { user: joe, role: "owner", active_branch: null, last_active: NOW_S - 2 * HOUR_S },
    ],
    branches: [
      {
        name: "main",
        kind: "main",
        ahead: 0,
        behind: 0,
        author: null,
        tip: { sha: "9f8e7d6c5b4a3210", message: "chore: release 1.4.0", at: NOW_S - 3 * DAY_S },
        ci: "none",
        pr: null,
        commits: [
          { sha: "9f8e7d6c5b4a3210", message: "chore: release 1.4.0", author_login: "joe-evans", at: NOW_S - 3 * DAY_S },
        ],
      },
      {
        name: "staging",
        kind: "staging",
        ahead: 0,
        behind: 0,
        author: null,
        tip: { sha: "8e7d6c5b4a392101", message: "chore: promote to staging", at: NOW_S - 2 * DAY_S },
        ci: "none",
        pr: null,
        commits: [
          { sha: "8e7d6c5b4a392101", message: "chore: promote to staging", author_login: "joe-evans", at: NOW_S - 2 * DAY_S },
        ],
      },
      {
        name: "dev",
        kind: "dev",
        ahead: 0,
        behind: 0,
        author: null,
        tip: { sha: "7d6c5b4a39210fed", message: "chore: bump dependencies", at: NOW_S - DAY_S },
        ci: "none",
        pr: null,
        commits: [
          { sha: "7d6c5b4a39210fed", message: "chore: bump dependencies", author_login: "simon-siedler", at: NOW_S - DAY_S },
        ],
      },
      {
        name: "feature/dh-114-load-forecast",
        kind: "feature",
        ahead: 3,
        behind: 1,
        author: { name: mansi.name, github_login: mansi.github_login },
        tip: { sha: "a1b2c3d4e5f6a7b8", message: "feat: add forecast horizon to optimizer", at: NOW_S - HOUR_S },
        // Latest run on this branch is the RUNNING build below.
        ci: "running",
        pr: null,
        commits: [
          { sha: "a1b2c3d4e5f6a7b8", message: "feat: add forecast horizon to optimizer", author_login: "mansi-gautam", at: NOW_S - HOUR_S },
          { sha: "c3d4e5f6a7b8c9d0", message: "test: property-check the balancer", author_login: "mansi-gautam", at: NOW_S - 5 * HOUR_S },
        ],
      },
      {
        name: "bug/dh-118-rounding",
        kind: "bug",
        ahead: 1,
        behind: 0,
        author: { name: joe.name, github_login: joe.github_login },
        tip: { sha: "b2c3d4e5f6a7b8c9", message: "fix(rounding): clamp negative loads", at: NOW_S - 2 * HOUR_S },
        // Latest (only) run on this branch FAILED.
        ci: "failed",
        pr: { number: 12, title: "fix: clamp rounding", target: "dev", reviews_done: 1, reviews_required: 2 },
        commits: [
          { sha: "b2c3d4e5f6a7b8c9", message: "fix(rounding): clamp negative loads", author_login: "joe-evans", at: NOW_S - 2 * HOUR_S },
        ],
      },
    ],
    // Deliberately NOT running-first: the Pipelines panel must sort.
    runs: [
      {
        id: "run-test",
        workflow: "test",
        branch: "feature/dh-114-load-forecast",
        status: "passed",
        started_at: NOW_S - 500,
        duration_s: 92,
        triggered_by: "mansi-gautam",
        trigger_sha: "a1b2c3d4e5f6a7b8",
      },
      {
        id: "run-build",
        workflow: "build",
        branch: "feature/dh-114-load-forecast",
        status: "running",
        started_at: NOW_S - 252,
        duration_s: null,
        triggered_by: "mansi-gautam",
        trigger_sha: "a1b2c3d4e5f6a7b8",
      },
      {
        id: "run-gate",
        workflow: "gate",
        branch: "feature/dh-114-load-forecast",
        status: "queued",
        started_at: NOW_S - 600,
        duration_s: null,
        triggered_by: "mansi-gautam",
        trigger_sha: "a1b2c3d4e5f6a7b8",
      },
      {
        id: "run-validate",
        workflow: "validate",
        branch: "bug/dh-118-rounding",
        status: "failed",
        started_at: NOW_S - 4000,
        duration_s: 60,
        triggered_by: "joe-evans",
        trigger_sha: "b2c3d4e5f6a7b8c9",
      },
    ],
    commits: [
      {
        sha: "a1b2c3d4e5f6a7b8",
        message: "feat: add forecast horizon to optimizer",
        author: { name: mansi.name, github_login: mansi.github_login },
        branch: "feature/dh-114-load-forecast",
        at: NOW_S - HOUR_S,
      },
      {
        sha: "b2c3d4e5f6a7b8c9",
        message: "fix(rounding): clamp negative loads",
        author: { name: joe.name, github_login: joe.github_login },
        branch: "bug/dh-118-rounding",
        at: NOW_S - 2 * HOUR_S,
      },
      {
        sha: "7d6c5b4a39210fed",
        message: "chore: bump dependencies",
        author: { name: simon.name, github_login: simon.github_login },
        branch: "dev",
        at: NOW_S - DAY_S,
      },
      {
        sha: "6c5b4a39210fedcb",
        message: "docs: initial runbook",
        author: { name: joe.name, github_login: joe.github_login },
        branch: "main",
        at: Math.floor(Date.UTC(2026, 4, 12, 12) / 1000),
      },
    ],
  };
}

// ── Harness ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setup(overview?: () => Response | Promise<Response>) {
  const fetchImpl = vi.fn(async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    if (url.includes("/api/projects/") && url.endsWith("/overview")) {
      return overview ? overview() : jsonResponse(fixtureOverview());
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl: fetchImpl as typeof fetch });
  const utils = render(<ProjectScreen id="RMB-EN-042" api={api} />);
  return { fetchImpl, ...utils };
}

/** Flush pending microtasks (the mocked fetches resolve immediately). */
async function flush() {
  await act(async () => {});
}

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  writeText.mockClear();
  navigateMock.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ProjectScreen", () => {
  it("shows the pulsing skeleton while the overview loads", () => {
    setup(() => new Promise<Response>(() => {}));
    expect(screen.getByRole("status", { name: "Loading project" })).toBeInTheDocument();
  });

  it("renders every header field from the payload", async () => {
    setup();
    await flush();

    expect(screen.getByText("RMB-EN-042")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "District Heating Optimizer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Forecast-driven load balancing for DK networks"),
    ).toBeInTheDocument();

    // Chips: GBA, layout (mono uppercase), one per service.
    expect(screen.getByText("Energy")).toBeInTheDocument();
    expect(screen.getByText("MONOLITH")).toBeInTheDocument();
    expect(screen.getByText("API · python")).toBeInTheDocument();
    expect(screen.getByText("FE · react")).toBeInTheDocument();

    // Provenance line ("Joe Evans" also appears in Crew/Activity — scope it).
    const provenance = screen.getByText("Laid down by").parentElement!;
    expect(provenance).toHaveTextContent("Joe Evans");
    expect(provenance).toHaveTextContent("· 12 May 2026");
    expect(provenance).toHaveTextContent("api-python v2.1.0");

    // Status chip + repo action.
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("Open repo ↗")).toHaveAttribute(
      "href",
      "https://github.com/ramboll/district-heating-optimizer",
    );

    // Back link.
    expect(screen.getByText("← Projects")).toHaveAttribute("href", "/projects");
  });

  it("mounts the Flow panel with all branches", async () => {
    setup();
    await flush();
    expect(screen.getByText("THE FLOW")).toBeInTheDocument();
    expect(screen.getByTestId("flow-stub")).toHaveTextContent("5 branches");
  });

  it("sorts pipelines running-first, then started_at desc", async () => {
    setup();
    await flush();
    const rows = screen.getAllByTestId("run-row");
    const workflows = rows.map(
      (row) => within(row).getByText(/^(build|test|validate|gate)$/).textContent,
    );
    expect(workflows).toEqual(["build", "test", "gate", "validate"]);
  });

  it("ticks the elapsed time of a running run every second", async () => {
    setup();
    await flush();
    const [runningRow] = screen.getAllByTestId("run-row");
    expect(runningRow).toHaveTextContent("4m 12s"); // NOW − started_at = 252s
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(runningRow).toHaveTextContent("4m 13s");
  });

  it("shows durations for finished runs and QUEUED for queued ones", async () => {
    setup();
    await flush();
    const rows = screen.getAllByTestId("run-row");
    expect(rows[1]).toHaveTextContent("1m 32s"); // test, passed, 92s
    expect(rows[2]).toHaveTextContent("QUEUED"); // gate
    expect(rows[3]).toHaveTextContent("1m 0s"); // validate, failed, 60s
  });

  it("groups activity commits under Today / Yesterday / date headers", async () => {
    setup();
    await flush();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText("12 May")).toBeInTheDocument();
    expect(screen.getAllByTestId("commit-row")).toHaveLength(4);

    // Conventional-commit badge + stripped message.
    expect(screen.getByText("feat")).toBeInTheDocument();
    expect(screen.getByText("add forecast horizon to optimizer")).toBeInTheDocument();
  });

  it("copies the full sha when a commit sha is clicked", async () => {
    setup();
    await flush();
    const sha = screen.getByText("a1b2c3d"); // short sha of the newest commit
    fireEvent.click(sha);
    expect(writeText).toHaveBeenCalledWith("a1b2c3d4e5f6a7b8");
    expect(screen.getByText("copied ✓")).toBeInTheDocument();
  });

  it("lists the crew owners first, with active branch and OWNER tag", async () => {
    setup();
    await flush();
    const rows = screen.getAllByTestId("crew-row");
    expect(rows[0]).toHaveTextContent("Joe Evans");
    expect(rows[0]).toHaveTextContent("OWNER");
    expect(rows[1]).toHaveTextContent("Mansi Gautam");
    expect(rows[1]).toHaveTextContent("on feature/dh-114-load-forecast");
    expect(rows[2]).toHaveTextContent("Simon Scott Siedler");
  });

  it("renders the Day one panel: clone, skills, branch rule, CODEOWNERS", async () => {
    setup();
    await flush();
    expect(
      screen.getByText("git clone https://github.com/ramboll/district-heating-optimizer.git"),
    ).toBeInTheDocument();
    expect(screen.getByText("property-based-testing")).toBeInTheDocument();
    expect(screen.getByText("python-clean-code")).toBeInTheDocument();
    expect(screen.getByText("git-ci-governance")).toBeInTheDocument();
    expect(screen.getByText("feature|bug|hotfix/<ticket>-<slug>")).toBeInTheDocument();
    expect(screen.getByText("@joe-evans")).toBeInTheDocument();
  });

  it("header ⧉ Clone copies the git clone command and flips to COPIED ✓ for 1400ms", async () => {
    setup();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "⧉ Clone" }));
    expect(writeText).toHaveBeenCalledWith(
      "git clone https://github.com/ramboll/district-heating-optimizer.git",
    );
    expect(screen.getByRole("button", { name: "COPIED ✓" })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(screen.getByRole("button", { name: "⧉ Clone" })).toBeInTheDocument();
  });

  it("shows the API error state with a working retry", async () => {
    let calls = 0;
    const { fetchImpl } = setup(() => {
      calls += 1;
      return calls === 1
        ? jsonResponse({ error: "boom" }, 500)
        : jsonResponse(fixtureOverview());
    });
    await flush();
    expect(screen.getByText("Could not reach the Keel API")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await flush();
    expect(
      screen.getByRole("heading", { name: "District Heating Optimizer" }),
    ).toBeInTheDocument();
    expect(
      fetchImpl.mock.calls.filter(([u]) => String(u).endsWith("/overview")),
    ).toHaveLength(2);
  });

  it("shows the not-in-catalog state on a 404, with a back link", async () => {
    setup(() => jsonResponse({ error: "unknown project" }, 404));
    await flush();
    expect(screen.getByText("This project isn't in the catalog")).toBeInTheDocument();
    expect(screen.getByText("← Back to projects")).toHaveAttribute("href", "/projects");
    expect(screen.queryByText("Could not reach the Keel API")).not.toBeInTheDocument();
  });
});

describe("navigation into the dashboard", () => {
  it("ProjectsScreen rows navigate to /projects/$projectId", () => {
    render(<ProjectsScreen />);
    fireEvent.click(screen.getByText("Emissions Calculator"));
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/$projectId",
      params: { projectId: "RMB-EN-017" },
    });
  });

  it("HomeScreen project cards navigate to /projects/$projectId", () => {
    render(<HomeScreen />);
    fireEvent.click(screen.getByText("Project Insights Portal"));
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/$projectId",
      params: { projectId: "RMB-MC-024" },
    });
  });
});
