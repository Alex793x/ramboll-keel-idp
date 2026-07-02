/**
 * Activity panel (SPEC §18.3): the flat commit feed grouped Today / Yesterday /
 * `12 May`, with conventional-commit type badges, branch chips and mono
 * click-to-copy shas.
 */
import { color, font } from "../../design/tokens";
import type { OverviewCommit } from "../../lib/types";
import { Avatar } from "./Avatar";
import { COMMIT_TYPE_COLORS, groupCommits, splitConventional } from "./overview-view";
import { BranchChip, GlassPanel, useCopy } from "./primitives";

export function ActivityPanel({
  commits,
  nowS,
  index = 0,
}: {
  commits: OverviewCommit[];
  nowS: number;
  index?: number;
}) {
  const groups = groupCommits(commits, nowS);
  return (
    <GlassPanel label="ACTIVITY" index={index}>
      {groups.length === 0 ? (
        <div style={{ fontSize: 13, color: color.dim, padding: "8px 0" }}>No commits yet.</div>
      ) : (
        groups.map((g) => (
          <div key={g.label} style={{ marginBottom: 6 }}>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 10,
                letterSpacing: "0.18em",
                color: color.faint,
                textTransform: "uppercase",
                padding: "8px 2px 6px",
              }}
            >
              {g.label}
            </div>
            {g.commits.map((c) => (
              <CommitRow key={c.sha} commit={c} />
            ))}
          </div>
        ))
      )}
    </GlassPanel>
  );
}

function CommitRow({ commit }: { commit: OverviewCommit }) {
  const { type, rest } = splitConventional(commit.message);
  return (
    <div
      data-testid="commit-row"
      className="prj-row"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "9px 2px",
        borderBottom: "1px solid rgba(155,173,197,0.07)",
      }}
    >
      <Avatar name={commit.author.name} size={22} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          {type && <TypeBadge type={type} />}
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: color.body,
              lineHeight: 1.4,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {rest}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: color.dim }}>{commit.author.name}</span>
          <BranchChip name={commit.branch} />
          <CopySha sha={commit.sha} />
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const fg = COMMIT_TYPE_COLORS[type] ?? color.dim;
  return (
    <span
      style={{
        fontFamily: font.mono,
        fontSize: 9.5,
        letterSpacing: "0.08em",
        fontWeight: 600,
        color: fg,
        border: `1px solid ${fg}55`,
        borderRadius: 5,
        padding: "1px 6px",
        flex: "none",
      }}
    >
      {type}
    </span>
  );
}

/** Short mono sha; click copies the full sha (KB copy feedback, 1400ms). */
function CopySha({ sha }: { sha: string }) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      className="prj-sha"
      onClick={() => copy(sha)}
      title="Copy full SHA"
      style={{
        fontFamily: font.mono,
        fontSize: 10,
        color: copied ? color.grass : color.dim,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        letterSpacing: "0.04em",
      }}
    >
      {copied ? "copied ✓" : sha.slice(0, 7)}
    </button>
  );
}
