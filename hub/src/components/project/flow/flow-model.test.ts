/**
 * Unit + property tests for the pure BranchFlow layout model (SPEC §18.3).
 * Properties are pinned with fast-check; fixtures satisfy the frozen
 * `OverviewBranch` wire types exactly.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CiState, OverviewBranch, OverviewBranchCommit, OverviewPr } from '../../../lib/types';
import {
  KIND_COLOR,
  LANE_GAP,
  LANE_H,
  MAX_TICKS,
  RAIL_ORDER,
  ariaLabelFor,
  ciGlyph,
  commitTickPositions,
  forkStep,
  initials,
  isRailKind,
  laneGeometry,
  middleTruncate,
  relAge,
  splitBranches,
} from './flow-model';

/* ── arbitraries ────────────────────────────────────────────────────────── */

const shaArb = fc.integer({ min: 0, max: 0xffffffff }).map((n) => n.toString(16).padStart(8, '0'));

const commitArb: fc.Arbitrary<OverviewBranchCommit> = fc.record({
  sha: shaArb,
  message: fc.string({ maxLength: 40 }),
  author_login: fc.string({ minLength: 1, maxLength: 12 }),
  at: fc.integer({ min: 0, max: 2_000_000_000 }),
});

const ciArb: fc.Arbitrary<CiState> = fc.constantFrom('running', 'passed', 'failed', 'none');

const prArb: fc.Arbitrary<OverviewPr | null> = fc.option(
  fc.record({
    number: fc.integer({ min: 1, max: 999 }),
    title: fc.string({ maxLength: 30 }),
    target: fc.constant('dev'),
    reviews_done: fc.integer({ min: 0, max: 3 }),
    reviews_required: fc.integer({ min: 1, max: 3 }),
  }),
  { nil: null },
);

function branchArb(...kinds: OverviewBranch['kind'][]): fc.Arbitrary<OverviewBranch> {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 40 }),
    kind: fc.constantFrom(...kinds),
    ahead: fc.integer({ min: 0, max: 50 }),
    behind: fc.integer({ min: 0, max: 50 }),
    author: fc.option(
      fc.record({ name: fc.string({ minLength: 1, maxLength: 20 }), github_login: fc.string({ minLength: 1, maxLength: 12 }) }),
      { nil: null },
    ),
    tip: fc.record({ sha: shaArb, message: fc.string({ maxLength: 40 }), at: fc.integer({ min: 0, max: 2_000_000_000 }) }),
    ci: ciArb,
    pr: prArb,
    commits: fc.array(commitArb, { maxLength: 5 }),
  });
}

const tributaryArb = branchArb('feature', 'bug', 'hotfix');

/** At most one of each rail + up to 8 tributaries, deliberately interleaved
 *  in a non-canonical order (tribs first, rails reversed). */
const branchesArb: fc.Arbitrary<OverviewBranch[]> = fc
  .tuple(
    fc.option(branchArb('main'), { nil: null }),
    fc.option(branchArb('staging'), { nil: null }),
    fc.option(branchArb('dev'), { nil: null }),
    fc.array(tributaryArb, { maxLength: 8 }),
  )
  .map(([main, staging, dev, tribs]) => [
    ...tribs,
    ...(dev ? [dev] : []),
    ...(staging ? [staging] : []),
    ...(main ? [main] : []),
  ]);

/* ── splitBranches ──────────────────────────────────────────────────────── */

describe('splitBranches', () => {
  it('property: rails are always [main, staging, dev] and never tributaries', () => {
    fc.assert(
      fc.property(branchesArb, (branches) => {
        const { rails, tributaries } = splitBranches(branches);
        expect(rails).toHaveLength(3);
        rails.forEach((rail, i) => {
          if (rail) expect(rail.kind).toBe(RAIL_ORDER[i]);
        });
        for (const t of tributaries) expect(isRailKind(t.kind)).toBe(false);
      }),
    );
  });

  it('property: tributaries sorted running-first then tip.at desc', () => {
    fc.assert(
      fc.property(branchesArb, (branches) => {
        const { tributaries } = splitBranches(branches);
        for (let i = 1; i < tributaries.length; i++) {
          const prev = tributaries[i - 1];
          const cur = tributaries[i];
          if (!prev || !cur) throw new Error('unreachable');
          const prevRun = prev.ci === 'running' ? 0 : 1;
          const curRun = cur.ci === 'running' ? 0 : 1;
          expect(prevRun).toBeLessThanOrEqual(curRun);
          if (prevRun === curRun) expect(prev.tip.at).toBeGreaterThanOrEqual(cur.tip.at);
        }
      }),
    );
  });

  it('property: split is a partition — every branch lands in exactly one bucket', () => {
    fc.assert(
      fc.property(branchesArb, (branches) => {
        const { rails, tributaries } = splitBranches(branches);
        const out = [...rails.filter((r): r is OverviewBranch => r !== null), ...tributaries];
        expect(out).toHaveLength(branches.length);
        const inNames = branches.map((b) => b.name).sort();
        const outNames = out.map((b) => b.name).sort();
        expect(outNames).toEqual(inNames);
      }),
    );
  });

  it('orders rails main→staging→dev regardless of input order', () => {
    const mk = (name: string, kind: OverviewBranch['kind'], at: number): OverviewBranch => ({
      name,
      kind,
      ahead: kind === 'main' || kind === 'staging' || kind === 'dev' ? 0 : 1,
      behind: 0,
      author: null,
      tip: { sha: 'abcdef12', message: 'm', at },
      ci: 'none',
      pr: null,
      commits: [],
    });
    const { rails, tributaries } = splitBranches([
      mk('dev', 'dev', 3),
      mk('feature/x', 'feature', 5),
      mk('main', 'main', 1),
      mk('staging', 'staging', 2),
    ]);
    expect(rails.map((r) => r?.name)).toEqual(['main', 'staging', 'dev']);
    expect(tributaries.map((t) => t.name)).toEqual(['feature/x']);
  });

  it('tolerates missing rails (null slots)', () => {
    const { rails, tributaries } = splitBranches([]);
    expect(rails).toEqual([null, null, null]);
    expect(tributaries).toEqual([]);
  });
});

/* ── middleTruncate ─────────────────────────────────────────────────────── */

describe('middleTruncate', () => {
  it('property: result length ≤ max', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), fc.integer({ min: 2, max: 60 }), (s, max) => {
        expect(middleTruncate(s, max).length).toBeLessThanOrEqual(max);
      }),
    );
  });

  it('property: long names keep their prefix and suffix around a single …', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 10, maxLength: 120 }), fc.integer({ min: 5, max: 9 }), (s, max) => {
        fc.pre(s.length > max);
        const out = middleTruncate(s, max);
        const head = Math.ceil((max - 1) / 2);
        const tail = Math.floor((max - 1) / 2);
        expect(out.startsWith(s.slice(0, head))).toBe(true);
        expect(out.endsWith(s.slice(s.length - tail))).toBe(true);
        expect(out).toContain('…');
      }),
    );
  });

  it('property: idempotent, and identity for short strings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), fc.integer({ min: 2, max: 60 }), (s, max) => {
        const once = middleTruncate(s, max);
        expect(middleTruncate(once, max)).toBe(once);
        if (s.length <= max) expect(once).toBe(s);
      }),
    );
  });

  it('truncates a realistic branch name in the middle', () => {
    const name = 'feature/rmb-142-load-forecasting-with-very-long-suffix';
    const out = middleTruncate(name, 34);
    expect(out).toHaveLength(34);
    expect(out.startsWith('feature/rmb-142-l')).toBe(true);
    expect(out.endsWith('-long-suffix')).toBe(true);
  });
});

/* ── commitTickPositions ────────────────────────────────────────────────── */

describe('commitTickPositions', () => {
  it('property: at most 5 positions, all within [0, laneWidth]', () => {
    fc.assert(
      fc.property(fc.array(commitArb, { maxLength: 10 }), fc.integer({ min: 1, max: 1000 }), (commits, w) => {
        const pos = commitTickPositions(commits, w);
        expect(pos.length).toBe(Math.min(commits.length, MAX_TICKS));
        for (const p of pos) {
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(w);
        }
      }),
    );
  });

  it('property: monotonic with time — newer commits never sit left of older', () => {
    fc.assert(
      fc.property(fc.array(commitArb, { minLength: 2, maxLength: 5 }), fc.integer({ min: 1, max: 1000 }), (commits, w) => {
        const pos = commitTickPositions(commits, w);
        for (let i = 0; i < commits.length; i++) {
          for (let j = 0; j < commits.length; j++) {
            const ci = commits[i];
            const cj = commits[j];
            const pi = pos[i];
            const pj = pos[j];
            if (!ci || !cj || pi === undefined || pj === undefined) throw new Error('unreachable');
            if (ci.at > cj.at) expect(pi).toBeGreaterThanOrEqual(pj);
          }
        }
      }),
    );
  });

  it('property: deterministic', () => {
    fc.assert(
      fc.property(fc.array(commitArb, { maxLength: 5 }), fc.integer({ min: 1, max: 1000 }), (commits, w) => {
        expect(commitTickPositions(commits, w)).toEqual(commitTickPositions(commits, w));
      }),
    );
  });

  it('pins the anchor cases: empty, single, ties', () => {
    const c = (at: number): OverviewBranchCommit => ({ sha: String(at), message: '', author_login: 'a', at });
    expect(commitTickPositions([], 100)).toEqual([]);
    expect(commitTickPositions([c(5)], 100)).toEqual([100]);
    // Newest-first input with all-equal timestamps spreads evenly, newest right.
    expect(commitTickPositions([c(7), c(7), c(7)], 100)).toEqual([100, 50, 0]);
    // Linear recency spacing: newest at the lane tip.
    expect(commitTickPositions([c(30), c(20), c(10)], 100)).toEqual([100, 50, 0]);
  });
});

/* ── laneGeometry ───────────────────────────────────────────────────────── */

describe('laneGeometry', () => {
  it('property: fork x-offsets are staggered (strictly increasing per lane)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), (count) => {
        for (let i = 1; i < count; i++) {
          expect(laneGeometry(i, count).forkX).toBeGreaterThan(laneGeometry(i - 1, count).forkX);
        }
      }),
    );
  });

  it('property: lane tops stack by LANE_H + LANE_GAP and dev sits above', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 11 }), fc.integer({ min: 1, max: 12 }), (i, count) => {
        fc.pre(i < count);
        const g = laneGeometry(i, count);
        expect(g.laneTop).toBe(i * (LANE_H + LANE_GAP));
        expect(g.laneCY).toBe(g.laneTop + LANE_H / 2);
        expect(g.devY).toBeLessThan(0);
        expect(g.connectorD).toContain('Q');
        expect(g.returnD).toContain('Q');
      }),
    );
  });

  it('tightens the stagger step for crowded flows', () => {
    expect(forkStep(3)).toBeGreaterThan(forkStep(8));
  });
});

/* ── glyphs, labels, misc ───────────────────────────────────────────────── */

describe('ciGlyph', () => {
  it('maps every CI state to its SPEC colour', () => {
    expect(ciGlyph('running')).toEqual({ state: 'running', color: '#0098EB', label: 'CI running' });
    expect(ciGlyph('passed')).toEqual({ state: 'passed', color: '#ADD095', label: 'CI passed' });
    expect(ciGlyph('failed')).toEqual({ state: 'failed', color: '#FF8855', label: 'CI failed' });
    expect(ciGlyph('none')).toEqual({ state: 'none', color: '#375B8B', label: 'no CI runs' });
  });

  it('kind colours match the SPEC hexes', () => {
    expect(KIND_COLOR).toEqual({ feature: '#66C1F3', bug: '#FFE682', hotfix: '#FF8855' });
  });
});

describe('ariaLabelFor', () => {
  const base: OverviewBranch = {
    name: 'feature/rmb-142-load-forecasting',
    kind: 'feature',
    ahead: 3,
    behind: 0,
    author: { name: 'Magdalena Keller', github_login: 'mkeller' },
    tip: { sha: 'abc1234f', message: 'wip', at: 100 },
    ci: 'running',
    pr: null,
    commits: [],
  };

  it('matches the SPEC example shape', () => {
    expect(ariaLabelFor(base)).toBe(
      'feature/rmb-142-load-forecasting, 3 ahead, CI running, by Magdalena Keller',
    );
  });

  it('mentions behind and the PR only when present', () => {
    const withAll = ariaLabelFor({
      ...base,
      behind: 2,
      ci: 'passed',
      pr: { number: 12, title: 't', target: 'dev', reviews_done: 1, reviews_required: 2 },
      author: null,
    });
    expect(withAll).toBe('feature/rmb-142-load-forecasting, 3 ahead, 2 behind, CI passed, PR #12 open');
  });
});

describe('relAge / initials', () => {
  it('formats each magnitude bucket', () => {
    const now = 1_000_000;
    expect(relAge(now - 5, now)).toBe('just now');
    expect(relAge(now - 90, now)).toBe('1m ago');
    expect(relAge(now - 3 * 3600, now)).toBe('3h ago');
    expect(relAge(now - 5 * 86400, now)).toBe('5d ago');
    expect(relAge(now + 50, now)).toBe('just now'); // clock skew clamps to 0
  });

  it('derives initials from first + last name part', () => {
    expect(initials('Magdalena Keller')).toBe('MK');
    expect(initials('Prince')).toBe('P');
    expect(initials('  jo   van   der  berg ')).toBe('JB');
    expect(initials('')).toBe('?');
  });
});
