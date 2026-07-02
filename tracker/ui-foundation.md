# Fleet-UI-Foundation — tracker

Agent: `fleet-ui-foundation` · Branch: `main` · Date: 2026-07-02
Assignment: Design foundation — tokens, global css, icons, clock, root route.

## Files

### Created
- `hub/src/design/tokens.ts` — FROZEN `color` + `font` contract (22 colors, 2 font stacks), doc comments mapping names to Ramboll scales (CYAN 500–100, OCEAN, spot GRASS/SUN/CLAY/HEATH, INK).
- `hub/src/design/global.css` — exact port of design source lines 16–31 (scrollbar rules, placeholder color, all 9 keyframes verbatim: fadeUp, fadeIn, driftA, driftB, spin, pulseDot, popIn, ringPulse, edgeDraw) + base `body { font-family:'Nunito',system-ui,sans-serif; color:#E6EAF0; }`.
- `hub/src/design/icons.tsx` — `PathIcon` (24×24, currentColor, strokeWidth 1.8, 17px default), `ICONS` map (home/folder/book/grid/branch/zap/bot/help exact from source lines 940–947, plus `search: 'm21 21-4.3-4.3'`, `check: 'M20 6 9 17l-5-5'`), `SearchIcon` component (`<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>`, configurable size/stroke).
- `hub/src/hooks/useClock.ts` — `formatClock(d)` pure formatter + `useClock()` hook. Exact port of source lines 661–665: `HH:MM:SS CET`, padStart(2,'0'), 1000ms interval, cleanup on unmount, starts `''` (source behavior — first value on first tick).
- `hub/src/hooks/useClock.test.ts`, `hub/src/design/tokens.test.ts` — 6 tests.
- `hub/public/assets/ramboll-logo-white.png`, `hub/public/assets/ramboll-logo-cyan.png` — byte-identical copies from design `assets/` (shasums verified: white `376f49b6…`, cyan `d30dd4d9…`).

### Rewritten
- `hub/src/routes/__root.tsx` — kept `createRootRoute` / `HeadContent` / `Scripts` / `?url`-stylesheet conventions. Head: charset, viewport, title `Ramboll Developer Hub`, Google Fonts preconnect + exact Nunito/JetBrains Mono stylesheet URL, `../design/global.css?url` link. Body renders bare `<Outlet />` — no shared chrome (screens own their shell).

### Deleted
- `hub/src/styles/` (tokens.css — whole dir), `hub/src/components/AppHeader.tsx`, `hub/src/components/AppFooter.tsx`.

## Exact-token verification
- All 22 `color` hex values grep-verified present in `Ramboll Developer Hub.dc.html` (e.g. `#05132A` ×1, `#0098EB` ×20, `#6984A8` ×36). No rounding/substitution.
- `tokens.test.ts` asserts the full frozen object equality (contract regression guard).
- global.css keyframes/scrollbar/placeholder rules copied character-for-character from source lines 18–30.

## Cross-agent notes
- Grep after deletion: **zero** references to `AppHeader`, `AppFooter`, `styles/tokens`, or `app.css` anywhere in `hub/src` — only `__root.tsx` referenced them and it was rewritten here. No action needed from route-owning agents on this front.
- Root route no longer renders any wrapper div/class (`rb-app`/`rb-main` are gone); screen agents must provide full-page chrome themselves.
- `ICONS.search` is only the path half of the glyph; use `SearchIcon` for the circle+path combo as in the design.

## Validation
- `cd hub && npx vitest run src/hooks src/design` → 2 files, 6 tests, all passed.
- Full `tsc` intentionally NOT run (parallel route rewrites in flight; routeTree regen at integration).

## MemTrace
- Intent published: `01KWHEY46V0NAV28JTA3B6CJTS` (no active conflicts, coordination advice: clear).
- Episode recorded at end of run (id in fleet log; see `fleet_query_episodes` agent `fleet-ui-foundation`).
