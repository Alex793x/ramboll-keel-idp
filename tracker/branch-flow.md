# BranchFlow — "the Flow" (SPEC §18.3, fleet area C)

The novel branch-exploration centerpiece of the v4 project dashboard. Purely
presentational: `<BranchFlow branches={OverviewBranch[]} onSelect?={(name|null)=>void}/>` —
no fetching, no router, internal hover + focus state only. Exclusive files:
`hub/src/components/project/flow/**` + this tracker.

## Files

| File | Role |
| --- | --- |
| `BranchFlow.tsx` | The component (exports `BranchFlow`, `BranchFlowProps`). |
| `flow-model.ts` | PURE layout/derivation math — no DOM, no React. |
| `flow.css` | Hover/focus pseudo-states + transitions, prefix `rdh-flow-`. |
| `flow-model.test.ts` | 22 tests (11 fast-check properties + pinned units). |
| `BranchFlow.test.tsx` | 12 Testing Library interaction tests. |

## Design rationale

The Flow mirrors the governance Keel enforces — which is why it reads
instantly: three permanent **rails** (main brightest + protection shield,
staging dimmed cyan, dev `#0098EB`) and working branches as **tributaries**
forking off dev.

**Connector geometry is deterministic, not measured.** Both SVG overlays
(left-anchored fork curves, right-anchored dashed PR "merge intent" returns)
live behind the lane cards (`z-index 0` vs `1`) with `overflow: visible`, and
every coordinate comes from `laneGeometry(i, count)` — pure math over the
layout constants (`RAIL_H 34`, `LANE_H 44`, `LANE_GAP 10`, `SECTION_GAP 18`).
Fork points stagger along the dev rail (`forkX = 176 + i·step`, step tightens
from 44 to 32 when >5 lanes) and drop as a quadratic bezier into each lane's
top edge with a 26px leftward drift; the vertical runs weave *behind* the
near-opaque glass lanes and surface as colored stitches in the row gaps.
A lane's own geometry depends only on the lanes **above** it, and only one
lane can ever be expanded — so the focused lane's connector is always exact,
and focus mode fades the (potentially stale) others to zero (`rdh-flow-ghost`)
instead of letting them misalign.

**Motion** reuses the design's exact idiom (from `global.css`, never
duplicated): rails `fadeUp` + a `scaleX` line draw-in (`rdhFlowRailIn`, the
only new keyframe), connectors `edgeDraw` via `pathLength=1`, tributaries
`popIn` staggered 70ms on `cubic-bezier(0.2,0.7,0.2,1)`, running CI =
`ringPulse` + `pulseDot`. Hover = the DocDiagram connect/dim pattern: the
lane lifts (`translateY(-2px)`, `0 10px 26px rgba(5,50,110,.35)`, brightened
border) while everything else — rails included — dims to 0.35 over 180ms, and
its connector goes full-alpha/2.4px.

**Focus mode** (click or Enter): the lane expands in place via the
`grid-template-rows: 0fr → 1fr` trick, revealing ≤5 commit rows (sha ·
message · author · age), the PR line (`PR #12 → dev · 1/2 reviews`) with a
thin review progress bar; others compress to 0.35. Exit: click again,
Escape, or click-away (document `mousedown` outside any `[data-rdh-lane]`;
clicks on another lane switch focus directly). `onSelect(name)` fires on
enter, `onSelect(null)` on leave. No external "Open branch" link — repo URLs
aren't in the frozen props, so nothing navigates (per brief: omit).

**Ages** use a local `relAge` (just now/m/h/d) instead of `lib/time.ts` to
keep this fleet area dependency-free.

## flow-model.ts surface

- `splitBranches(branches) → { rails: [main|null, staging|null, dev|null], tributaries }` —
  rails in fixed order regardless of input order, missing rails tolerated
  (first occurrence wins on duplicates); tributaries sorted running-CI-first,
  then `tip.at` desc, name asc as deterministic tie-break.
- `laneGeometry(i, count)` — staggered `forkX`, lane tops/centres, `devY`,
  quadratic `connectorD`/`returnD` path strings + return-curve midpoint
  (`B(.5) = .25·P0 + .5·C + .25·P2`) anchoring the `PR #n` pill.
- `commitTickPositions(commits, laneWidth)` — recency-spaced x positions in
  `[0, laneWidth]` (rendered as percentages), newest at the tip, ≤5, clamped,
  deterministic, monotonic with time; even spread on all-equal timestamps.
- `middleTruncate(name, max)` — head + `…` + tail, length ≤ max, idempotent.
- `ciGlyph(state)` — running `#0098EB` pulse · passed `#ADD095` ✓ · failed
  `#FF8855` ✗ · none faint hollow (`#375B8B`); labels reused in aria text.
- `ariaLabelFor(branch)` — "name, N ahead[, M behind], CI …[, PR #n open][, by Author]".
- Helpers: `relAge`, `initials`, `avatarGradient` (deterministic hash pick),
  `KIND_COLOR` (feature `#66C1F3` · bug `#FFE682` · hotfix `#FF8855`),
  `RAIL_ORDER`, layout constants.

## Accessibility

- Tributaries container: `role="list"`, `aria-label="Working branches"`,
  `tabIndex=0`; ArrowUp/ArrowDown = roving focus (roving `tabIndex`, real
  `.focus()`), Enter toggles focus mode, Escape exits.
- Lanes: `role="listitem"`, `aria-expanded`, full `aria-label` (e.g.
  "feature/rmb-142-load-forecasting, 3 ahead, CI running, by Magdalena
  Keller"); visible focus ring `rgba(0,152,235,.5)` via `:focus-visible`.
- Detail strip `aria-hidden` while collapsed; overlays/pills `aria-hidden`
  decorative; CI glyphs carry `title` labels.
- Empty state: dashed mono placeholder
  "No working branches — start one: `git switch -c feature/<ticket>-<slug>`".

## Tests — 34 total, all green

- `flow-model.test.ts` (22): fast-check properties — splitBranches partition /
  rail order / never-in-tributaries / sort invariant; middleTruncate length /
  prefix+suffix / idempotence; tick positions bounds / time-monotonicity /
  determinism; laneGeometry stagger + stacking — plus pinned units (SPEC
  colors, aria example, relAge buckets, initials, anchor cases).
- `BranchFlow.test.tsx` (12): rails + lanes render, running-first order,
  hover lift/dim (rails included) + unhover restore, click focus-mode
  (aria-expanded, detail strip, `onSelect(name)`), re-click / Escape /
  click-away collapse (`onSelect(null)`), ArrowDown/Up roving focus with
  clamping, Enter toggle via bubbling, empty placeholder, single running
  pulse class, tick tooltips + `+ahead −behind` counters.

Gates: `npx tsc --noEmit` clean · `npx vitest run src/components/project/flow`
34/34 · full `npx vitest run` 262/262. (Note: `src/lib/wizard-model.test.ts`
has a pre-existing seed-dependent flake — "every emitted service lang is a
valid lowercase slug" — unrelated to this area; flagged separately.)
