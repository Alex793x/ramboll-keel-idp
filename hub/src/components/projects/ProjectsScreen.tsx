/**
 * PROJECTS screen — EXACT port of the design source
 * `Ramble IDP Hub MVP Design/Ramboll Developer Hub.dc.html` lines 190–219.
 *
 * A header row plus a six-column table card listing every onboarded project.
 * Row hover lives in `projects.css`; data comes from the shared
 * `lib/hub-data` fixtures.
 */
import { color, font } from "../../design/tokens";
import { PROJECTS, statusChipStyle, type HubProject } from "../../lib/hub-data";
import "./projects.css";

/** Shared grid template for the header and body rows (source lines 201, 205). */
const GRID_COLUMNS = "110px 1.6fr 1fr 90px 1fr 110px";

export function ProjectsScreen() {
  return (
    <div
      style={{
        padding: "36px 40px 60px",
        maxWidth: 1240,
        margin: "0 auto",
        animation: "fadeUp 0.5s cubic-bezier(0.2,0.7,0.2,1) both",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 26,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              margin: "0 0 4px",
              color: color.white,
            }}
          >
            Projects
          </h1>
          <p style={{ fontSize: 14, color: color.muted, margin: 0 }}>
            Everything your teams have onboarded to the hub.
          </p>
        </div>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: color.dim,
            letterSpacing: "0.08em",
          }}
        >
          {PROJECTS.length} PROJECTS · 3 GBAS
        </div>
      </div>

      <div
        style={{
          background: color.card,
          border: "1px solid rgba(155,173,197,0.14)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRID_COLUMNS,
            gap: 14,
            padding: "12px 22px",
            borderBottom: "1px solid rgba(155,173,197,0.12)",
            fontFamily: font.mono,
            fontSize: 10,
            letterSpacing: "0.14em",
            color: color.dim,
          }}
        >
          <span>ID</span>
          <span>PROJECT</span>
          <span>GBA</span>
          <span>SERVICES</span>
          <span>LAST DEPLOY</span>
          <span>HEALTH</span>
        </div>
        {PROJECTS.map((p) => (
          <ProjectRow key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}

/** One table row (source lines 205–215). */
function ProjectRow({ project: p }: { project: HubProject }) {
  return (
    <div
      className="projects-row"
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLUMNS,
        gap: 14,
        alignItems: "center",
        padding: "15px 22px",
        borderBottom: "1px solid rgba(155,173,197,0.07)",
      }}
    >
      <span style={{ fontFamily: font.mono, fontSize: 11, color: color.cyan300 }}>
        {p.id}
      </span>
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: color.white }}>{p.name}</div>
        <div style={{ fontSize: 12, color: color.dim }}>{p.desc}</div>
      </div>
      <span
        style={{
          display: "inline-flex",
          width: "fit-content",
          padding: "4px 10px",
          borderRadius: 9999,
          fontSize: 11,
          fontWeight: 700,
          background: "rgba(204,234,251,0.1)",
          color: color.cyan200,
        }}
      >
        {p.gba}
      </span>
      <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.muted }}>
        {p.services}
      </span>
      <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.muted }}>
        {p.deploy}
      </span>
      <span style={statusChipStyle(p.status)}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
        {p.status}
      </span>
    </div>
  );
}
