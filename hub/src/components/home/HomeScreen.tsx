/**
 * HOME screen — EXACT port of the design source
 * `Ramble IDP Hub MVP Design/Ramboll Developer Hub.dc.html` lines 118–188.
 *
 * Layout, sizes, and colours are verbatim from the source; hover states live
 * in `home.css` (inline styles cannot express `:hover`). Data comes from the
 * shared `lib/hub-data` fixtures.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { color, font } from "../../design/tokens";
import { useSession } from "../../hooks/useSession";
import {
  PROJECTS,
  RECS,
  UPDATES,
  WORK_STATS,
  dateLine,
  greetingFor,
  statusChipStyle,
  type HubProject,
} from "../../lib/hub-data";
import "./home.css";

export function HomeScreen() {
  const { session } = useSession();
  // Design source line 933: `userName = this.props.userName ?? 'Kristoffer Pedersen'`.
  const userName = session?.name ?? "Kristoffer Pedersen";
  const userFirst = userName.split(" ")[0];
  const now = new Date();

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
          fontFamily: font.mono,
          fontSize: 11,
          letterSpacing: "0.2em",
          color: color.cyan300,
          marginBottom: 10,
        }}
      >
        {dateLine(now)}
      </div>
      <h1
        style={{
          fontSize: 38,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          margin: "0 0 6px",
          color: color.white,
        }}
      >
        {greetingFor(now.getHours())}, {userFirst}.
      </h1>
      <p style={{ fontSize: 16, color: color.muted, margin: "0 0 34px" }}>
        Build, ship, operate and understand software at Ramboll.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 14,
          marginBottom: 38,
        }}
      >
        {WORK_STATS.map((w) => (
          <div
            key={w.label}
            className="home-stat-card"
            style={{
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: color.white,
                }}
              >
                {w.n}
              </span>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: w.dot,
                  flex: "none",
                }}
              />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: color.muted }}>
              {w.label}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 28,
          alignItems: "start",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: color.white }}>
              Your projects
            </h2>
            <Link
              to="/projects"
              className="home-view-all"
              style={{ fontSize: 13, fontWeight: 700 }}
            >
              View all →
            </Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {PROJECTS.slice(0, 4).map((p) => (
              <HomeProjectCard key={p.id} project={p} />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 12px", color: color.white }}>
              Platform updates
            </h2>
            <div
              style={{
                background: color.card,
                border: "1px solid rgba(155,173,197,0.14)",
                borderRadius: 12,
                padding: "6px 0",
              }}
            >
              {UPDATES.map((u) => (
                <div
                  key={u.title}
                  className="home-update-row"
                  style={{
                    padding: "13px 18px",
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    borderBottom: "1px solid rgba(155,173,197,0.08)",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: u.dot,
                      flex: "none",
                      marginTop: 5,
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: color.body,
                        lineHeight: 1.35,
                      }}
                    >
                      {u.title}
                    </div>
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        color: color.dim,
                        marginTop: 3,
                        letterSpacing: "0.06em",
                      }}
                    >
                      {u.meta}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 12px", color: color.white }}>
              Recommended
            </h2>
            <div
              style={{
                background: "rgba(255,230,130,0.06)",
                border: "1px solid rgba(255,230,130,0.25)",
                borderRadius: 12,
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {RECS.map((r) => (
                <div
                  key={r}
                  style={{
                    fontSize: 12.5,
                    color: color.body,
                    lineHeight: 1.4,
                    display: "flex",
                    gap: 9,
                  }}
                >
                  <span style={{ color: color.sun }}>▸</span>
                  {r}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One card in the 2×2 "Your projects" grid (source lines 144–159). Click → dashboard. */
function HomeProjectCard({ project: p }: { project: HubProject }) {
  const navigate = useNavigate();
  return (
    <div
      className="home-project-card"
      onClick={() =>
        void navigate({ to: "/projects/$projectId", params: { projectId: p.id } })
      }
      style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            letterSpacing: "0.1em",
            color: color.dim,
          }}
        >
          {p.id}
        </span>
        <span style={statusChipStyle(p.status)}>
          <span
            style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }}
          />
          {p.status}
        </span>
      </div>
      <div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 800,
            color: color.white,
            letterSpacing: "-0.01em",
            marginBottom: 3,
          }}
        >
          {p.name}
        </div>
        <div style={{ fontSize: 13, color: color.muted, lineHeight: 1.45 }}>{p.desc}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            display: "inline-flex",
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
        <span style={{ fontFamily: font.mono, fontSize: 10.5, color: color.dim }}>
          {p.services} services · {p.deploy}
        </span>
      </div>
    </div>
  );
}
