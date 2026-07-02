/**
 * ProjectScreen — the applefied mission-control dashboard for one project
 * (`/projects/:id`, SPEC §18.3). Fetches `GET /api/projects/:id/overview`
 * via the injectable KeelApi (WizardScreen idiom) and renders, top → bottom:
 * header · THE FLOW (BranchFlow) · Pipelines + Activity + sticky Crew/Day one.
 *
 * Loading shows pulsing glass skeletons (never a spinner); a 404 gets its own
 * "not in the catalog" state; any other failure the "Could not reach the Keel
 * API" card with a retry, mirroring the catalog page's tone.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { color, font } from "../../design/tokens";
import { useAsync } from "../../hooks/useAsync";
import { ApiError, getApi, type KeelApi } from "../../lib/api";
import type { ProjectOverview } from "../../lib/types";
import { ActivityPanel } from "./ActivityPanel";
import { CrewPanel } from "./CrewPanel";
import { DayOnePanel } from "./DayOnePanel";
import { FlowPanel } from "./FlowPanel";
import { PipelinesPanel } from "./PipelinesPanel";
import { ProjectHeader } from "./ProjectHeader";
import { GlassPanel } from "./primitives";
import "./project.css";

export function ProjectScreen({ id, api }: { id: string; api?: KeelApi }) {
  const client = api ?? getApi();
  const [attempt, setAttempt] = useState(0);
  const { data, loading, error } = useAsync<ProjectOverview>(
    () => client.projectOverview(id),
    [id, attempt],
  );

  return (
    <div
      style={{
        padding: "30px 40px 70px",
        maxWidth: 1240,
        margin: "0 auto",
        animation: "fadeUp 0.5s cubic-bezier(0.2,0.7,0.2,1) both",
      }}
    >
      {loading && <SkeletonState />}
      {error && !loading && (
        <ErrorState error={error} onRetry={() => setAttempt((n) => n + 1)} />
      )}
      {data && !loading && !error && <Dashboard overview={data} />}
    </div>
  );
}

function Dashboard({ overview }: { overview: ProjectOverview }) {
  // One "now" per payload: relative labels stay consistent across panels.
  // (The Pipelines panel ticks its own second-resolution clock for elapsed.)
  const nowS = Math.floor(Date.now() / 1000);
  return (
    <>
      <ProjectHeader project={overview.project} />
      <div style={{ marginBottom: 22 }}>
        <GlassPanel label="THE FLOW" live index={0}>
          <FlowPanel branches={overview.branches} />
        </GlassPanel>
      </div>
      <div className="prj-columns">
        <PipelinesPanel runs={overview.runs} index={1} />
        <ActivityPanel commits={overview.commits} nowS={nowS} index={2} />
        <aside className="prj-sticky">
          <CrewPanel team={overview.team} nowS={nowS} index={3} />
          <DayOnePanel repos={overview.project.repos} team={overview.team} index={4} />
        </aside>
      </div>
    </>
  );
}

/* ── Loading: pulsing skeleton in glass panels (no spinner) ─────────────────── */

function SkeletonState() {
  return (
    <div aria-label="Loading project" role="status">
      <div className="prj-skel-bar" style={{ width: 90, height: 13, marginBottom: 24 }} />
      <div className="prj-skel-bar" style={{ width: 130, height: 11, marginBottom: 12 }} />
      <div className="prj-skel-bar" style={{ width: 340, height: 34, marginBottom: 12 }} />
      <div className="prj-skel-bar" style={{ width: 420, height: 14, marginBottom: 28 }} />
      <SkeletonPanel height={210} index={0} />
      <div className="prj-columns" style={{ marginTop: 22 }}>
        <SkeletonPanel height={280} index={1} />
        <SkeletonPanel height={280} index={2} />
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <SkeletonPanel height={150} index={3} />
          <SkeletonPanel height={190} index={4} />
        </div>
      </div>
    </div>
  );
}

function SkeletonPanel({ height, index }: { height: number; index: number }) {
  return (
    <div
      className="prj-panel"
      style={{
        background: color.card,
        borderRadius: 12,
        padding: "18px 20px",
        height,
        animation: `popIn 0.5s cubic-bezier(0.2,0.7,0.2,1) ${index * 70}ms both`,
      }}
    >
      <div className="prj-skel-bar" style={{ width: 110, height: 10, marginBottom: 18 }} />
      <div className="prj-skel-bar" style={{ width: "82%", height: 12, marginBottom: 12 }} />
      <div className="prj-skel-bar" style={{ width: "64%", height: 12, marginBottom: 12 }} />
      <div className="prj-skel-bar" style={{ width: "73%", height: 12 }} />
    </div>
  );
}

/* ── Error + not-found states ───────────────────────────────────────────────── */

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div
      style={{
        background: color.card,
        border: "1px solid rgba(155,173,197,0.14)",
        borderRadius: 12,
        padding: "46px 40px",
        maxWidth: 560,
        margin: "60px auto 0",
        textAlign: "center",
        animation: "popIn 0.5s cubic-bezier(0.2,0.7,0.2,1) both",
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          letterSpacing: "0.2em",
          color: notFound ? color.dim : color.clay,
          marginBottom: 12,
        }}
      >
        {notFound ? "NOT IN CATALOG" : "CONNECTION LOST"}
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: color.white, margin: "0 0 10px" }}>
        {notFound ? "This project isn't in the catalog" : "Could not reach the Keel API"}
      </h2>
      <p style={{ fontSize: 14, color: color.muted, lineHeight: 1.55, margin: "0 0 24px" }}>
        {notFound
          ? "It may have been retired, renamed, or never initialized through the hub."
          : "The overview endpoint did not answer. Check that keel-api is running, then try again."}
      </p>
      {notFound ? (
        <Link
          to="/projects"
          className="prj-back"
          style={{ fontSize: 13.5, fontWeight: 800, textDecoration: "none" }}
        >
          ← Back to projects
        </Link>
      ) : (
        <button
          type="button"
          className="prj-retry"
          onClick={onRetry}
          style={{
            padding: "11px 26px",
            borderRadius: 9999,
            border: "none",
            background: color.cyan500,
            color: "#fff",
            fontFamily: font.sans,
            fontSize: 13.5,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
