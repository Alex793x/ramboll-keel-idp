/**
 * Dashboard header (SPEC §18.3 zone 1): back link, mono project id, 38px/800
 * name, description, chip row (GBA / layout / services), provenance line and
 * the right-aligned actions (`Open repo ↗` / `Docs` / `⧉ Clone`) with the
 * status chip on top.
 */
import { Link } from "@tanstack/react-router";
import { color, font } from "../../design/tokens";
import { statusChipStyle } from "../../lib/hub-data";
import { formatDateLong } from "../../lib/time";
import type { OverviewProject } from "../../lib/types";
import { Avatar } from "./Avatar";
import { cloneCommand, serviceChipLabel } from "./overview-view";
import { useCopy } from "./primitives";

/** GBA chip — the exact pill from the projects table (ProjectsScreen.tsx). */
const gbaChipStyle = {
  display: "inline-flex",
  width: "fit-content",
  padding: "4px 10px",
  borderRadius: 9999,
  fontSize: 11,
  fontWeight: 700,
  background: "rgba(204,234,251,0.1)",
  color: color.cyan200,
} as const;

const monoChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  fontFamily: font.mono,
  fontSize: 10,
  letterSpacing: "0.08em",
  color: color.muted,
  border: "1px solid rgba(155,173,197,0.25)",
  borderRadius: 6,
  padding: "3px 9px",
} as const;

export function ProjectHeader({ project }: { project: OverviewProject }) {
  const { copied, copy } = useCopy();
  const primaryRepo = project.repos[0];

  return (
    <header style={{ marginBottom: 24 }}>
      <Link
        to="/projects"
        className="prj-back"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          fontWeight: 700,
          textDecoration: "none",
          marginBottom: 22,
        }}
      >
        ← Projects
      </Link>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: "0.24em",
              color: color.cyan300,
              marginBottom: 8,
            }}
          >
            {project.id}
          </div>
          <h1
            style={{
              fontSize: 38,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              margin: "0 0 8px",
              color: color.white,
              textWrap: "balance",
            }}
          >
            {project.name}
          </h1>
          <p style={{ fontSize: 15.5, color: color.muted, lineHeight: 1.55, margin: "0 0 16px", maxWidth: "62ch" }}>
            {project.description}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <span style={gbaChipStyle}>{project.gba}</span>
            <span style={monoChipStyle}>{project.layout.toUpperCase()}</span>
            {project.services.map((s) => (
              <span key={s.dir} style={monoChipStyle}>
                {serviceChipLabel(s)}
              </span>
            ))}
          </div>

          {project.initialized_by && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: color.muted }}>
              <span>Laid down by</span>
              <Avatar name={project.initialized_by.name} size={22} />
              <span style={{ fontWeight: 700, color: color.body }}>{project.initialized_by.name}</span>
              {project.initialized_at !== null && (
                <span style={{ color: color.dim }}>· {formatDateLong(project.initialized_at)}</span>
              )}
              <span style={{ color: color.dim }}>
                · from{" "}
                <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.cyan200 }}>
                  {project.blueprint} v{project.blueprint_version}
                </span>
              </span>
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14, flex: "none" }}>
          <span style={statusChipStyle(project.status)}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
            {project.status}
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {primaryRepo && (
              <a
                href={primaryRepo.html_url}
                target="_blank"
                rel="noreferrer"
                className="prj-action prj-action--primary"
                style={actionStyle}
              >
                Open repo ↗
              </a>
            )}
            <Link to="/knowledge" className="prj-action" style={{ ...actionStyle, textDecoration: "none" }}>
              Docs
            </Link>
            {primaryRepo && (
              <button
                type="button"
                className="prj-action"
                onClick={() => copy(cloneCommand(primaryRepo))}
                style={{ ...actionStyle, fontFamily: font.mono, fontSize: 11.5, letterSpacing: "0.04em" }}
              >
                {copied ? "COPIED ✓" : "⧉ Clone"}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

const actionStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "9px 16px",
  borderRadius: 9999,
  border: "1px solid rgba(155,173,197,0.35)",
  background: "transparent",
  color: color.body,
  fontFamily: font.sans,
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
} as const;
