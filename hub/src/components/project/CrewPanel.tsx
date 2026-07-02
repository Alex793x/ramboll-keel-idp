/**
 * Crew panel (SPEC §18.3, sticky column): owners first with the mono OWNER
 * tag, avatar/name/chapter, the cyan mono "on `feature/…`" line when a member
 * has an active branch, and last-active relative time.
 */
import { color, font } from "../../design/tokens";
import { timeAgo } from "../../lib/time";
import type { OverviewTeamMember } from "../../lib/types";
import { Avatar } from "./Avatar";
import { crewSorted } from "./overview-view";
import { GlassPanel } from "./primitives";

export function CrewPanel({
  team,
  nowS,
  index = 0,
}: {
  team: OverviewTeamMember[];
  nowS: number;
  index?: number;
}) {
  const sorted = crewSorted(team);
  return (
    <GlassPanel label="CREW" index={index}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {sorted.map((m) => (
          <CrewRow key={m.user.id} member={m} nowS={nowS} />
        ))}
      </div>
    </GlassPanel>
  );
}

function CrewRow({ member: m, nowS }: { member: OverviewTeamMember; nowS: number }) {
  return (
    <div
      data-testid="crew-row"
      className="prj-row"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "9px 2px",
        borderBottom: "1px solid rgba(155,173,197,0.07)",
      }}
    >
      <Avatar name={m.user.name} size={28} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: color.white,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {m.user.name}
          </span>
          {m.role === "owner" && (
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 8.5,
                letterSpacing: "0.14em",
                color: color.cyan300,
                border: "1px solid rgba(102,193,243,0.35)",
                borderRadius: 4,
                padding: "1px 5px",
                flex: "none",
              }}
            >
              OWNER
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: color.dim, marginTop: 1 }}>{m.user.chapter}</div>
        {m.active_branch && (
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 10.5,
              color: color.cyan300,
              marginTop: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            on {m.active_branch}
          </div>
        )}
      </div>
      <span style={{ fontSize: 10.5, color: color.faint, flex: "none", marginTop: 2 }}>
        {timeAgo(m.last_active, nowS)}
      </span>
    </div>
  );
}
