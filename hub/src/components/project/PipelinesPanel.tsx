/**
 * Pipelines panel (SPEC §18.3): CI/CD runs, running first. Running rows carry
 * a pulsing cyan ring and a per-second ticking elapsed; queued a hollow dot;
 * finished rows a grass ✓ / clay ✗ with their duration.
 */
import { color, font } from "../../design/tokens";
import { formatDuration, timeAgo } from "../../lib/time";
import type { OverviewRun } from "../../lib/types";
import { LoginAvatar } from "./Avatar";
import { sortRuns } from "./overview-view";
import { BranchChip, GlassPanel } from "./primitives";
import { useNowS } from "./useNowS";

export function PipelinesPanel({ runs, index = 0 }: { runs: OverviewRun[]; index?: number }) {
  const anyRunning = runs.some((r) => r.status === "running");
  const nowS = useNowS(anyRunning);
  const sorted = sortRuns(runs);

  return (
    <GlassPanel label="PIPELINES" live={anyRunning} index={index}>
      {sorted.length === 0 ? (
        <div style={{ fontSize: 13, color: color.dim, padding: "8px 0" }}>No runs yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {sorted.map((run) => (
            <RunRow key={run.id} run={run} nowS={nowS} />
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

function RunRow({ run, nowS }: { run: OverviewRun; nowS: number }) {
  return (
    <div
      data-testid="run-row"
      className="prj-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 2px",
        borderBottom: "1px solid rgba(155,173,197,0.07)",
      }}
    >
      <StatusGlyph status={run.status} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: color.white }}>{run.workflow}</span>
          <BranchChip name={run.branch} />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginTop: 4,
            fontSize: 11.5,
            color: color.dim,
          }}
        >
          <LoginAvatar login={run.triggered_by} size={16} />
          <span style={{ fontFamily: font.mono, fontSize: 10.5, color: color.muted }}>
            {run.triggered_by}
          </span>
          <span>· {timeAgo(run.started_at, nowS)}</span>
        </div>
      </div>
      <RunTiming run={run} nowS={nowS} />
    </div>
  );
}

function RunTiming({ run, nowS }: { run: OverviewRun; nowS: number }) {
  if (run.status === "running") {
    return (
      <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.cyan300 }}>
        {formatDuration(Math.max(0, nowS - run.started_at))}
      </span>
    );
  }
  if (run.status === "queued") {
    return (
      <span style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: "0.1em", color: color.dim }}>
        QUEUED
      </span>
    );
  }
  return (
    <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.muted }}>
      {run.duration_s !== null ? formatDuration(run.duration_s) : ""}
    </span>
  );
}

function StatusGlyph({ status }: { status: OverviewRun["status"] }) {
  switch (status) {
    case "running":
      return (
        <span
          aria-label="running"
          style={{
            width: 11,
            height: 11,
            borderRadius: "50%",
            border: `2px solid ${color.cyan400}`,
            animation: "pulseDot 1.2s ease-in-out infinite",
            flex: "none",
          }}
        />
      );
    case "queued":
      return (
        <span
          aria-label="queued"
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            border: "1.5px solid rgba(155,173,197,0.5)",
            flex: "none",
          }}
        />
      );
    case "passed":
      return (
        <span aria-label="passed" style={{ color: color.grass, fontSize: 13, fontWeight: 800, flex: "none" }}>
          ✓
        </span>
      );
    case "failed":
      return (
        <span aria-label="failed" style={{ color: color.clay, fontSize: 13, fontWeight: 800, flex: "none" }}>
          ✗
        </span>
      );
  }
}
