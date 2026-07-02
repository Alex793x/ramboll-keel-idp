# Tracker — Dashboard add-service (SPEC §19.4/§19.5, fleet area C)

Agent: **fleet-dashboard-add** · branch `feature/named-services`

## Files

### New
- `hub/src/components/project/AddServicePopover.tsx` — the ghost `+ Add service` chip
  (dashed mono chip, wizard type-card hover) + anchored glass popover (`role="dialog"`,
  aria-label `Add a service component`, popIn 0.35s, card `#0A1B33` / border
  `rgba(102,193,243,.25)` / radius 12 / shadow `0 32px 80px rgba(0,0,0,.5)`).
  Three compact steps in one card: 5 type cards (live `getServiceCatalog()` via
  `useAsync`, fetched lazily on open) → language chips (unavailable ⇒ dimmed + SOON,
  disabled `<button>`) → mono name input prefilled with the next free default.
  Exports pure logic: `takenServiceNames` (dir basenames ∪ names),
  `suggestServiceName` (`tag` → `tag-1` → … first free), `serviceNameError`
  (`SERVICE_NAME_RE` + duplicates), and the hold constants `CATALOG_NOTE_MS` (2000)
  / `CLOSE_AFTER_SUCCESS_MS` (900).
- `hub/src/components/project/AddServicePopover.test.tsx` — 9 tests (mocked fetch
  through a real `KeelApi`, ProjectScreen.test idiom): open/focus-first-card/Esc +
  focus-return, click-away vs inside click, 5 cards + SOON langs, Add enablement
  (type→lang→name, empty/uppercase/valid), suggestion prefill (`api` taken ⇒ `api-1`,
  `wk` free ⇒ `wk`), duplicates vs dirs AND names, happy path (exact POST body,
  4-row event strip with ✓ glyphs, `onAdded` after the hold), `materialized:false`
  note held 2s, 400 → inline server message + form stays editable. Plus a direct
  `suggestServiceName` walk (`tag`/`tag-1`/`tag-2`).

### Modified
- `hub/src/lib/api.ts` — `addProjectService(id, body: AddServiceBody):
  Promise<AddServiceResponse>` → `POST /api/projects/:id/services` (existing
  `request()` idiom, id URL-encoded). Non-2xx re-throws `ApiError` with the server's
  JSON `{error}` as the message (new `serverErrorMessage` helper; body/status kept).
- `hub/src/lib/api.test.ts` — +3 tests: 200 happy (method/headers/exact body/encoding),
  400 collision message surfaces as `ApiError.message`, 404 unknown project.
- `hub/src/components/project/ProjectHeader.tsx` — minimal: new optional props
  `api?: AddServiceApi` + `onServiceAdded?: () => void`; `<AddServicePopover/>`
  appended after the service chips in the chip row. Nothing else touched.
- `hub/src/components/project/ProjectScreen.tsx` — refetch wiring: `Dashboard` now
  takes `api` (the screen's injectable client) + `onServiceAdded`, and the screen
  passes `() => setAttempt(n => n + 1)` — the SAME state the error-card Retry uses,
  so a successful add re-runs the overview `useAsync` and the new chip / Day-one
  repo render from fresh data.
- `hub/src/components/project/ProjectScreen.test.tsx` — setup mock additively handles
  `/api/service-catalog` + `POST …/services`; +1 wiring test (open popover → add →
  note → 2s → popover closed + second `/overview` fetch). All pre-existing tests
  untouched and green.
- `hub/src/components/project/project.css` — `.prj-addsvc-chip` / `.prj-addsvc-type`
  hover (wizard `.wz-type-card:hover` verbatim: `#0098EB` border +
  `rgba(0,152,235,.07)` wash), `.prj-addsvc-name:focus` (wizard input ring),
  `.prj-addsvc-add:not(:disabled):hover`, `.prj-addsvc-pulse` (pulseDot).

## Component API

```tsx
<AddServicePopover
  projectId={string}                 // catalog slug / RMB-*
  services={OverviewService[]}       // suggestion + collision input
  api?={AddServiceApi}               // Pick<KeelApi, "getServiceCatalog" | "addProjectService">
  onAdded?={() => void}              // fired once per success, right before close
/>
```

## Design decisions
- **Chip + card in one component**: the wrapper `<span>` holds trigger and popover, so
  ProjectHeader's edit is a single appended element and click-away (which checks the
  wrapper) lets the trigger toggle instead of close-then-reopen.
- **Lang auto-defaults on type pick** (wizard `defaultLang` idiom): picking a type card
  selects its first available language and resets the name to the suggestion, so the
  three steps collapse to one click for the common case.
- **`materialized:true` also holds briefly** (900ms) so the event strip is perceivable
  before the skeleton-refetch; `materialized:false` holds the mono
  `catalog-only · demo project` note for the SPEC'd 2s.
- **Suggestion collides on dir basenames AND names** (`services/api` → `api`), matching
  the server's merged-set collision check (§19.4) for both layouts.
- **Submit-state machine** `form(error) → pending → done(response)`: a 400 lands back in
  `form` with the server's message (from `ApiError.message`, parsed in api.ts) so the
  inputs never lock up.

## Counts
- Gates: `npx tsc --noEmit` clean · `npx vitest run` 20 files / 282 tests, all green.
- New tests: 13 (9 popover + 3 api + 1 screen wiring).
