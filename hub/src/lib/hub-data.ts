/**
 * Hub screen data + presentation helpers — EXACT port from the design source
 * `Ramble IDP Hub MVP Design/Ramboll Developer Hub.dc.html`:
 *
 * - {@link PROJECTS}        — source lines 635–642
 * - {@link statusChipStyle} — source lines 673–682 (`statusChip`)
 * - {@link greetingFor}     — source line 971
 * - {@link dateLine}        — source line 972
 * - {@link WORK_STATS}      — source lines 974–979
 * - {@link UPDATES}         — source lines 983–987
 * - {@link RECS}            — source lines 988–992
 *
 * Values are verbatim from the source of truth; do not round, rephrase, or
 * "normalize" anything here.
 */
import type { CSSProperties } from "react";

export interface HubProject {
  id: string;
  name: string;
  desc: string;
  gba: string;
  services: number;
  deploy: string;
  status: "Healthy" | "Warning" | "Critical" | "Experimental";
}

/** The six catalog rows the design ships with (source lines 636–641). */
export const PROJECTS: HubProject[] = [
  { id: "RMB-EN-017", name: "Emissions Calculator", desc: "Whole-life carbon estimates for infrastructure bids", gba: "Energy", services: 3, deploy: "2d ago", status: "Healthy" },
  { id: "RMB-MC-024", name: "Project Insights Portal", desc: "Cross-project delivery metrics for programme leads", gba: "Management Consulting", services: 4, deploy: "5h ago", status: "Warning" },
  { id: "RMB-WA-031", name: "Groundwater Twin", desc: "Digital twin for aquifer monitoring, Jutland pilot", gba: "Water", services: 2, deploy: "9d ago", status: "Experimental" },
  { id: "RMB-TR-008", name: "Bridge Inspection AI", desc: "Drone imagery defect detection & reporting", gba: "Transport", services: 5, deploy: "1d ago", status: "Healthy" },
  { id: "RMB-EN-042", name: "District Heating Optimizer", desc: "Forecast-driven load balancing for DK networks", gba: "Energy", services: 3, deploy: "3d ago", status: "Healthy" },
  { id: "RMB-WA-012", name: "Customer Data API", desc: "Unified client & asset master data service", gba: "Water", services: 2, deploy: "2d ago", status: "Healthy" },
];

const STATUS_CHIP_COLORS: Record<HubProject["status"], { bg: string; fg: string }> = {
  Healthy: { bg: "rgba(173,208,149,0.12)", fg: "#ADD095" },
  Warning: { bg: "rgba(255,230,130,0.12)", fg: "#FFE682" },
  Critical: { bg: "rgba(255,136,85,0.14)", fg: "#FF8855" },
  Experimental: { bg: "rgba(224,212,219,0.12)", fg: "#C0A9B7" },
};

/**
 * Style for a project-status chip (source `statusChip`, lines 673–682). The
 * chip is rendered with a 6px `currentColor` dot before the label (source
 * line 148).
 */
export function statusChipStyle(status: HubProject["status"]): CSSProperties {
  const c = STATUS_CHIP_COLORS[status];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    width: "fit-content",
    padding: "4px 11px",
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 700,
    background: c.bg,
    color: c.fg,
  };
}

/** Time-of-day greeting (source line 971). */
export function greetingFor(hour: number): string {
  return hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** `THURSDAY, 2 JULY 2026`-style date line (source line 972). */
export function dateLine(d: Date): string {
  return d
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .toUpperCase();
}

export interface WorkStat {
  n: number;
  label: string;
  dot: string;
}

/** Home "your work" stat cards (source lines 974–979). */
export const WORK_STATS: WorkStat[] = [
  { n: 3, label: "PRs awaiting your review", dot: "#66C1F3" },
  { n: 2, label: "Failing builds", dot: "#FF8855" },
  { n: 1, label: "Deployment pending approval", dot: "#FFE682" },
  { n: 4, label: "Assigned tickets", dot: "#9BADC5" },
];

export interface PlatformUpdate {
  title: string;
  meta: string;
  dot: string;
}

/** "Platform updates" feed (source lines 983–987). */
export const UPDATES: PlatformUpdate[] = [
  { title: "New Azure deployment golden path available", meta: "PLATFORM · 2D AGO", dot: "#0098EB" },
  { title: "GitHub Actions template v3 released", meta: "CI/CD · 4D AGO", dot: "#ADD095" },
  { title: "Security policy update effective 12 July", meta: "GOVERNANCE · 1W AGO", dot: "#FFE682" },
];

/** "Recommended" action items (source lines 988–992). */
export const RECS: string[] = [
  "Add CODEOWNERS to groundwater-twin-api",
  "Update deprecated dependency in emissions-calculator-fe",
  "Review API documentation for customer-data-api",
];
