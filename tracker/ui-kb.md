# Fleet-UI-KB — Knowledge Base port

Status: **done** — `npx vitest run` (full hub suite) 140/140 green, `tsc --noEmit` clean.

## Files created

| File | What |
| --- | --- |
| `hub/src/lib/diagram-engine.ts` | 1:1 TS port of `diagram-engine.js`: `KINDS` (10 kinds, exact palette), `layoutFlow` (longest-path ranks, 3 barycenter sweeps, LR/TB, back-edge loops, groups, label-aware canvas growth), `layoutSequence` (176px cols, 46px rows, self-loops). Typed `FlowSpec`/`SequenceSpec`/`DiagramSpec` + laid-out output types. |
| `hub/src/lib/diagram-engine.test.ts` | Determinism, coordinates/default sizes (172/150/88/58/48), rank monotonicity, back-edge geometry (`up` arrow, yb = max+48), TB, exact group offsets (−16/−34/+16/+14), dangling-edge drop, sequence rows/lifelines/self/dir/dashed, unknown-actor throw. |
| `hub/src/lib/docs-data.ts` | Verbatim port of all 3 docs (create-api, event-driven, authoring) — every block, code string, table, diagram spec — plus `STUBS` (6) and `CATS` (4). Typed block union per contract. |
| `hub/src/components/kb/RichText.tsx` | Port of `rich()` — exact regex, `**bold**`/`` `code` ``/`[link]()`/`*em*` token styles. |
| `hub/src/components/kb/blocks.tsx` | `TONES` (verbatim), `badgeStyle` (cyan/heath/grass), P/Heading/Callout/Code/Steps/Table/Divider renderers. Code block: clipboard + `COPIED ✓` for 1400ms. |
| `hub/src/components/kb/DocDiagram.tsx` | Port of `prepFlow`/`prepSeq`/`prepDiagram`/`flowNode`: light `#F9F9F7` card, FLOW/SEQUENCE tag, dotted stage scaled `min(1, 706/w)` clamped ≥0.68, edgeDraw/fadeIn/popIn timings (70/80/100ms staggers), arrowheads, white label pills, diamond polygons, pill shapes, hover connect/dim via `useState`, legend from used kinds. |
| `hub/src/components/kb/KbHomeScreen.tsx` | KB home: kicker/H1/sub exact copy, search pill + category chips, AND filter on title+desc+category, 3-col card grid with meta line, exact empty state, stub rows with SOON chips. |
| `hub/src/components/kb/DocReader.tsx` | Two-column reader (`minmax(0,1fr) 250px` gap 46): back link, badge/H1/desc/hairline, block switch, sticky aside with ON THIS PAGE TOC (h2→12px / h3→26px indent, scrolls nearest scrollable ancestor with −20px offset — AppShell's `overflowY:auto` wrapper) + OWNER/UPDATED/VERSION/READ TIME meta card + "Ask the agent" pill (no-op). Scrolls to top on doc open (rAF, like `openDoc`). |
| `hub/src/components/kb/kb.css` | Hover states as classes (inline styles can't hover): search pill, card lift, back link, COPY, TOC items, ask button — exact source values. |
| `hub/src/components/kb/kb.test.tsx` | 16 tests: RichText grammar, home filtering/empty state/card click, reader header/TOC/steps/table/copy-timer/back, diagram flow+sequence render and hover dimming. |
| `hub/src/routes/knowledge.tsx` | Thin route in `AppShell`. Since `knowledge.$docId` nests under it in TanStack file routing, it renders `<Outlet/>` when a child matches (via `useChildMatches`) so the shell mounts once. |
| `hub/src/routes/knowledge.$docId.tsx` | Thin route; `beforeLoad` redirects unknown ids to `/knowledge`; renders `DocReader`. |

## Port fidelity notes / engine edge cases

- **Geometry is byte-identical math**: gapX 74, gapY 30, pad 28; node sizes 172 (box), 150×88 (diamond), 58 h (with sub), 48 h (plain); back edges swing `max(bottoms)+48` with the path visually ending 7px below the arrow tip (as in source); edge-label canvas growth `lx + len*3.2 + 10`; group boxes −16/−34/+16/+14.
- `noUncheckedIndexedAccess` forced `?? 0` guards on rank/pos lookups — identical results for any valid spec (the JS produced `NaN` only on dangling edge ids, which it also silently dropped from output edges; that drop is preserved and tested).
- `layoutSequence` on an unknown actor id: the JS crashed with a `TypeError`; the port throws a descriptive `Error` instead (fail-loud preserved, no silent drift).
- Hover state: the design kept one global `dh = {b, n}` keyed by block; per-`DocDiagram` local state is equivalent (only one node hoverable at a time).
- `Math.max(...[])` → `-Infinity` on an empty-nodes flow spec, same as the source's `Math.max.apply` (only reachable via hand-built specs; all shipped docs have nodes).
- Scroll-to-heading: source used a `_scroll` ref on its own container; port finds the nearest scrollable ancestor (AppShell's content div) and applies the same −20px smooth scroll, with a `window` fallback.
- routeTree.gen.ts was regenerated automatically by the vite plugin during the test run; both routes registered, `$docId` nested under `/knowledge`.
