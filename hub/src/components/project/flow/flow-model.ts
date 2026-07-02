/**
 * flow-model — PURE layout & derivation logic for the BranchFlow centerpiece
 * (SPEC §18.3). No DOM, no React: everything in this module is deterministic
 * math and string work, unit-tested in `flow-model.test.ts`. `BranchFlow.tsx`
 * is the only consumer.
 *
 * Coordinate system for connector geometry: the tributaries section's local
 * space — x = 0 at the section's left edge, y = 0 at the top of the FIRST
 * tributary lane. The dev rail sits ABOVE the section, so its centre line is
 * at a negative y (`devY`); the overlay SVGs render with `overflow: visible`
 * so negative coordinates draw fine.
 */
import type {
  BranchKind,
  CiState,
  OverviewBranch,
  OverviewBranchCommit,
} from '../../../lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Rails vs tributaries
// ─────────────────────────────────────────────────────────────────────────────

/** The three permanent rails, in their fixed top→bottom display order. */
export const RAIL_ORDER = ['main', 'staging', 'dev'] as const;
export type RailKind = (typeof RAIL_ORDER)[number];
export type TributaryKind = Exclude<BranchKind, RailKind>;

/** Kind accent colours (SPEC §18.3, exact hexes from the design). */
export const KIND_COLOR: Record<TributaryKind, string> = {
  feature: '#66C1F3',
  bug: '#FFE682',
  hotfix: '#FF8855',
};

export function isRailKind(kind: BranchKind): kind is RailKind {
  return kind === 'main' || kind === 'staging' || kind === 'dev';
}

export interface FlowSplit {
  /**
   * Fixed order `[main, staging, dev]` regardless of the input order; a slot
   * is `null` when the payload lacks that rail (tolerated, per SPEC). Should
   * the payload ever carry duplicate rails, the first occurrence wins.
   */
  rails: readonly [OverviewBranch | null, OverviewBranch | null, OverviewBranch | null];
  /** Working branches (feature|bug|hotfix): running CI first, then tip.at desc. */
  tributaries: OverviewBranch[];
}

/**
 * Partition the payload into the three rails and the sorted tributaries.
 * Sort: branches with `ci === "running"` first, then newest tip first;
 * name (asc) as the final deterministic tie-break.
 */
export function splitBranches(branches: readonly OverviewBranch[]): FlowSplit {
  const railOf = new Map<RailKind, OverviewBranch>();
  const tributaries: OverviewBranch[] = [];
  for (const b of branches) {
    if (isRailKind(b.kind)) {
      if (!railOf.has(b.kind)) railOf.set(b.kind, b);
    } else {
      tributaries.push(b);
    }
  }
  tributaries.sort((a, b) => {
    const ra = a.ci === 'running' ? 0 : 1;
    const rb = b.ci === 'running' ? 0 : 1;
    if (ra !== rb) return ra - rb;
    if (b.tip.at !== a.tip.at) return b.tip.at - a.tip.at;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return {
    rails: [railOf.get('main') ?? null, railOf.get('staging') ?? null, railOf.get('dev') ?? null],
    tributaries,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lane geometry — connector bezier math
// ─────────────────────────────────────────────────────────────────────────────

/** Rail row height (px). */
export const RAIL_H = 34;
/** Gap between rail rows (px). */
export const RAIL_GAP = 10;
/** Collapsed tributary lane height (px). */
export const LANE_H = 44;
/** Gap between tributary lanes (px). */
export const LANE_GAP = 10;
/** Gap between the dev rail's bottom edge and the first tributary lane (px). */
export const SECTION_GAP = 18;
/** Width of the rails' left label zone — forks start to the right of it. */
export const LABEL_W = 150;
/** Right inset of the PR-return anchor (px from the section's right edge). */
export const RETURN_INSET = 96;

const FORK_BASE_X = LABEL_W + 26;
/** Leftward drift of a fork's drop as it curves into its lane's top edge. */
const FORK_DRIFT = 26;
/** Rightward sweep of the dashed PR-return curve as it re-enters dev. */
const RETURN_SWEEP = 34;

/** Horizontal stagger between successive fork points along the dev rail. */
export function forkStep(count: number): number {
  return count > 5 ? 32 : 44;
}

export interface LaneGeometry {
  /** Fork x along the dev rail (section coords) — staggered per lane index. */
  forkX: number;
  /** Where the fork connector enters the lane's top edge. */
  entryX: number;
  /** Top y of the (collapsed) lane in section coords. */
  laneTop: number;
  /** Vertical centre of the lane header. */
  laneCY: number;
  /** y of the dev rail's centre line in section coords (negative: above). */
  devY: number;
  /** Quadratic bezier for the fork connector (dev rail → lane top edge). */
  connectorD: string;
  /**
   * Quadratic bezier for the dashed PR "merge intent" return curve, in
   * right-anchored local coords (x = 0 at `RETURN_INSET` from the right).
   */
  returnD: string;
  /** Midpoint of the return curve — anchor for the `PR #n` pill. */
  returnMid: { x: number; y: number };
}

/**
 * Deterministic geometry for tributary lane `i` of `count`. All lanes above
 * `i` are assumed collapsed (`LANE_H`) — which always holds for the lanes
 * whose connectors are visible, because focus mode ghosts the others.
 */
export function laneGeometry(i: number, count: number): LaneGeometry {
  const laneTop = i * (LANE_H + LANE_GAP);
  const laneCY = laneTop + LANE_H / 2;
  const devY = -(SECTION_GAP + RAIL_H / 2);
  const forkX = FORK_BASE_X + i * forkStep(count);
  const entryX = forkX - FORK_DRIFT;
  const connectorD = `M ${forkX} ${devY} Q ${forkX} ${laneTop} ${entryX} ${laneTop}`;
  const returnD = `M 0 ${laneCY} Q 0 ${devY} ${RETURN_SWEEP} ${devY}`;
  // Quadratic bezier at t = 0.5: B(.5) = .25·P0 + .5·C + .25·P2.
  const returnMid = { x: 0.25 * RETURN_SWEEP, y: 0.25 * laneCY + 0.75 * devY };
  return { forkX, entryX, laneTop, laneCY, devY, connectorD, returnD, returnMid };
}

// ─────────────────────────────────────────────────────────────────────────────
// Text helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Truncate the middle of a long branch name: keeps the head and the tail with
 * a single `…` between them. Result length never exceeds `max`; strings that
 * already fit come back unchanged (which also makes the function idempotent).
 */
export function middleTruncate(name: string, max: number): string {
  if (name.length <= max) return name;
  if (max <= 1) return '…';
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return name.slice(0, head) + '…' + (tail > 0 ? name.slice(name.length - tail) : '');
}

/**
 * Tiny local relative-age formatter ("3d ago"). Deliberately NOT imported
 * from `lib/time.ts` to keep this fleet area dependency-free (SPEC §18.4).
 */
export function relAge(at: number, now: number): string {
  const s = Math.max(0, now - at);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Initials for the avatar chip: first letter of the first + last name part. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return (first + last).toUpperCase();
}

/** Deterministic avatar gradient, picked by a tiny hash of the login. */
export function avatarGradient(login: string): string {
  const grads = [
    'linear-gradient(135deg, #0098EB, #05326E)',
    'linear-gradient(135deg, #66C1F3, #0098EB)',
    'linear-gradient(135deg, #C0A9B7, #05326E)',
    'linear-gradient(135deg, #ADD095, #05326E)',
    'linear-gradient(135deg, #33ADEF, #273943)',
  ] as const;
  let h = 0;
  for (let i = 0; i < login.length; i++) h = (h * 31 + login.charCodeAt(i)) >>> 0;
  return grads[h % grads.length] ?? grads[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Commit ticks
// ─────────────────────────────────────────────────────────────────────────────

/** At most this many commit ticks render per lane (contract: commits ≤ 5). */
export const MAX_TICKS = 5;

/**
 * Recency-spaced x positions for up to `MAX_TICKS` commits within
 * `[0, laneWidth]`: the newest commit lands at the right (the lane tip),
 * older ones proportionally to the left. Positions align 1:1 with the first
 * `MAX_TICKS` input commits, are clamped, deterministic, and monotonic with
 * time (an older commit never sits right of a newer one).
 */
export function commitTickPositions(
  commits: readonly OverviewBranchCommit[],
  laneWidth: number,
): number[] {
  const picked = commits.slice(0, MAX_TICKS);
  const n = picked.length;
  if (n === 0) return [];
  if (laneWidth <= 0) return picked.map(() => 0);
  if (n === 1) return [laneWidth];
  const ats = picked.map((c) => c.at);
  const min = Math.min(...ats);
  const max = Math.max(...ats);
  if (max === min) {
    // All simultaneous: spread evenly, preserving input (newest-first) order.
    return picked.map((_, i) => (laneWidth * (n - 1 - i)) / (n - 1));
  }
  return ats.map((at) => Math.min(laneWidth, Math.max(0, ((at - min) / (max - min)) * laneWidth)));
}

// ─────────────────────────────────────────────────────────────────────────────
// CI glyphs + accessibility
// ─────────────────────────────────────────────────────────────────────────────

export interface CiGlyphSpec {
  state: CiState;
  /** Accent colour of the glyph (exact SPEC hexes). */
  color: string;
  /** Human phrase, also used in aria labels ("CI running", "no CI runs"). */
  label: string;
}

/** CI state → glyph descriptor (running pulse, grass ✓, clay ✗, faint dot). */
export function ciGlyph(state: CiState): CiGlyphSpec {
  switch (state) {
    case 'running':
      return { state, color: '#0098EB', label: 'CI running' };
    case 'passed':
      return { state, color: '#ADD095', label: 'CI passed' };
    case 'failed':
      return { state, color: '#FF8855', label: 'CI failed' };
    case 'none':
      return { state, color: '#375B8B', label: 'no CI runs' };
  }
}

/**
 * Screen-reader label for a lane, e.g.
 * "feature/rmb-142-load-forecasting, 3 ahead, CI running, by Magdalena Keller".
 * `behind` and the PR are mentioned only when present.
 */
export function ariaLabelFor(branch: OverviewBranch): string {
  const parts = [branch.name, `${branch.ahead} ahead`];
  if (branch.behind > 0) parts.push(`${branch.behind} behind`);
  parts.push(ciGlyph(branch.ci).label);
  if (branch.pr) parts.push(`PR #${branch.pr.number} open`);
  if (branch.author) parts.push(`by ${branch.author.name}`);
  return parts.join(', ');
}
