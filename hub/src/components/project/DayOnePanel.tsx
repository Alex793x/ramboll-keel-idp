/**
 * Day one panel (SPEC §18.3, sticky column): everything a new crew member
 * needs on their first day — `git clone` per repo (KB copy pattern), the docs
 * link, the 3 embedded skills as chips, the branch-rule reminder and the
 * CODEOWNERS summary.
 */
import { Link } from "@tanstack/react-router";
import { color, font } from "../../design/tokens";
import type { OverviewRepo, OverviewTeamMember } from "../../lib/types";
import {
  BRANCH_RULE,
  DAY_ONE_SKILLS,
  cloneCommand,
  codeownersSummary,
} from "./overview-view";
import { GlassPanel, useCopy } from "./primitives";

export function DayOnePanel({
  repos,
  team,
  index = 0,
}: {
  repos: OverviewRepo[];
  team: OverviewTeamMember[];
  index?: number;
}) {
  const owners = codeownersSummary(team);
  return (
    <GlassPanel label="DAY ONE" index={index}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {repos.map((r) => (
          <CloneRow key={r.name} repo={r} />
        ))}
      </div>

      <Link
        to="/knowledge"
        className="prj-back"
        style={{ fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}
      >
        Read the golden-path docs →
      </Link>

      <SectionLabel>SKILLS ON BOARD</SectionLabel>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {DAY_ONE_SKILLS.map((s) => (
          <span
            key={s}
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              color: color.cyan200,
              background: "rgba(153,214,247,0.1)",
              border: "1px solid rgba(153,214,247,0.25)",
              borderRadius: 6,
              padding: "3px 8px",
            }}
          >
            {s}
          </span>
        ))}
      </div>

      <SectionLabel>BRANCH RULE</SectionLabel>
      <div style={{ fontFamily: font.mono, fontSize: 11, color: color.muted }}>{BRANCH_RULE}</div>

      {owners && (
        <>
          <SectionLabel>CODEOWNERS</SectionLabel>
          <div style={{ fontFamily: font.mono, fontSize: 11, color: color.muted }}>{owners}</div>
        </>
      )}
    </GlassPanel>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        fontFamily: font.mono,
        fontSize: 9.5,
        letterSpacing: "0.18em",
        color: color.faint,
        margin: "16px 0 7px",
      }}
    >
      {children}
    </div>
  );
}

/** One copyable `git clone …` line (KB CodeBlock idiom, compacted). */
function CloneRow({ repo }: { repo: OverviewRepo }) {
  const { copied, copy } = useCopy();
  const cmd = cloneCommand(repo);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: color.codeBg,
        border: "1px solid rgba(155,173,197,0.16)",
        borderRadius: 8,
        padding: "7px 10px",
      }}
    >
      <code
        style={{
          fontFamily: font.mono,
          fontSize: 10.5,
          color: "#C9E0F2",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          flex: 1,
        }}
        title={cmd}
      >
        {cmd}
      </code>
      <span
        className="kb-copy"
        onClick={() => copy(cmd)}
        style={{
          fontFamily: font.mono,
          fontSize: 9,
          letterSpacing: "0.1em",
          color: color.cyan300,
          border: "1px solid rgba(102,193,243,0.35)",
          borderRadius: 6,
          padding: "2px 8px",
          cursor: "pointer",
          flex: "none",
        }}
      >
        {copied ? "COPIED ✓" : "COPY"}
      </span>
    </div>
  );
}
