# Fleet-UI-HomeProjects — Home + Projects screens

Owner: **Fleet-UI-HomeProjects** · Status: ✅ **done**
Source of truth: `Ramble IDP Hub MVP Design/Ramboll Developer Hub.dc.html`

## Files

| File | Action | Ports |
| --- | --- | --- |
| `hub/src/lib/hub-data.ts` | created | PROJECTS (lines 635–642), statusChip (673–682), greeting/dateLine (971–972), WORK_STATS (974–979), UPDATES (983–987), RECS (988–992) |
| `hub/src/lib/hub-data.test.ts` | created | 14 tests: chip mapping (all 4 statuses), greeting boundaries + fast-check band/monotonicity properties, dateLine en-GB uppercase format, PROJECTS invariants (6 rows, unique `RMB-XX-NNN` ids, known statuses), fixture verbatim checks |
| `hub/src/components/home/HomeScreen.tsx` | created | HOME screen (lines 118–188): dateLine, greeting h1 (`userName ?? 'Kristoffer Pedersen'` via session, source line 933), sub, 4× stat cards, 2×2 project cards (`PROJECTS.slice(0,4)`), Platform updates, Recommended |
| `hub/src/components/home/home.css` | created | hover states (stat-card border, project-card border+translateY(-2px), View-all `#CCEAFB`, update-row bg) — base border/bg live in CSS so `:hover` can override |
| `hub/src/components/projects/ProjectsScreen.tsx` | created | PROJECTS screen (lines 190–219): header + `{PROJECTS.length} PROJECTS · 3 GBAS`, table card, grid `110px 1.6fr 1fr 90px 1fr 110px` |
| `hub/src/components/projects/projects.css` | created | row hover `rgba(204,234,251,0.04)` |
| `hub/src/routes/index.tsx` | rewritten | thin: `<AppShell><HomeScreen/></AppShell>` |
| `hub/src/routes/projects.tsx` | rewritten | thin: `<AppShell><ProjectsScreen/></AppShell>` |
| `hub/src/routes/index.test.ts` | deleted | tested `isBlueprintLive` of the old light-theme catalog home (no other importers) |

## Contracts consumed (frozen, not created)

- `hub/src/design/tokens.ts` — `color.*` / `font.*` used for every design colour that has a token; rgba() literals kept verbatim inline/CSS.
- `hub/src/components/shell/AppShell.tsx` — named export, wraps both routes.
- `design/global.css` — `fadeUp` keyframe referenced by both screen containers.

## Notes / faithful quirks

- The design header hardcodes the literal `3 GBAS` (source line 198) while the
  6 seeded projects actually span 4 distinct GBAs (Energy, Management
  Consulting, Water, Transport). Ported the literal exactly; project count is
  computed from `PROJECTS.length`.
- Status chip = `statusChipStyle(status)` + 6px `currentColor` dot (source
  line 148); GBA pill on Projects has `width: fit-content`, on Home it does
  not — both kept as in source.
- Greeting/date are computed at render from `new Date()`, mirroring the design.

## Validation

- `npx vitest run src/lib/hub-data.test.ts` — 14/14 green.
- Full `npx vitest run` — 11 files, 72/72 green.
- `npx tsc --noEmit` — no errors in owned files; one pre-existing error in
  `shell/Sidebar.tsx` (`/knowledge` route pending routeTree regeneration by
  the orchestrator), out of scope.
