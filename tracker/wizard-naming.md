# Wizard naming — nameable service components (SPEC §19.1/§19.5, fleet area B)

Every service row in the "Initialize a project" wizard gains an inline mono
name field; typing renames the service live (Live Blueprint + repo hints),
invalid/duplicate names block Initialize, and the payload sends `name` only
when the user set one. Exclusive files: `hub/src/lib/wizard-model.{ts,test.ts}`,
`hub/src/components/wizard/**`, this tracker. Types (`ServiceSelection.name?`,
`SERVICE_NAME_RE`) were frozen in `hub/src/lib/types.ts` by the orchestrator.

## Model (`wizard-model.ts`) — helpers shipped

- `Service` gains `name?: string` — the RAW user-typed value; blank/whitespace
  ⇒ unset. Trimming happens at resolution/payload time only.
- `defaultServiceName(services, i)` — the CURRENT ordinal default: `{type}`
  when unique, `{type}-{n}` when repeated, counted **among entries of that
  type without a custom name only** (SPEC §19.1). The entry at `i` is always
  counted as unnamed itself, so for unnamed entries placeholder == the server
  default from keel-core `resolve_service_names`, and naming one `api` of two
  renumbers the survivor back to the bare `api`.
- `resolvedServiceName(services, i)` — trimmed custom name if set, else the
  default. This is what the server will actually use.
- `serviceNameError(services, i) → string | null` — exported copy constants:
  - `SERVICE_NAME_FORMAT_ERROR` = "Use a-z, 0-9, hyphens (2–30 chars, start
    with a letter)" (custom name fails `SERVICE_NAME_RE`; checked on the
    trimmed value, format outranks duplicate);
  - `SERVICE_NAME_DUPLICATE_ERROR` = "Name already used in this project"
    (resolved name equals ANY other entry's resolved name, case-sensitive
    exact — both sides of a collision report it, including custom-vs-default
    collisions like naming an `fe` service `api` next to an unnamed api).
- `canInit` additionally requires zero name errors; `missingParts` appends
  `'valid service names'` (so `initHint` reads "Needs valid service names."
  instead of the degenerate "Needs .").
- `buildInitializePayload` — each `ServiceSelection` carries `name` ONLY when
  the user set one (trimmed); the default is never sent. With no names set
  the payload is **byte-identical** to v4 (pinned via `JSON.stringify`
  against a literal + a fast-check oracle of the pre-v5 builder).
- `repoName`/`serviceDir` now delegate to `resolvedServiceName` (same
  out-of-range throw contracts), so `blueprintRepoLine` previews
  `{slug}-{name}` / `services/{name}`; unnamed drafts are byte-equal to the
  v4 ordinals (property-pinned against the old algorithm as inline oracle).

## UI

- `WizardScreen.tsx`: `rename_service` action = `renameService(i, value)` via
  the existing `setServices` map-in-place idiom (stores the raw value). Each
  service row (now a column wrapper: row + optional error line) gains, between
  the label block and the language chips:
  - `.wz-name` input — mono 12.5px, transparent bg, bottom hairline border,
    placeholder = `defaultServiceName(...)` (muted `#6984A8`), width
    ch-clamped to content (8–32ch), `aria-label="Service name"`;
  - a tiny mono repo hint `ramboll/{slug}-{resolved}` under the field,
    updating per keystroke (the row's existing `repoName` line and the
    LiveBlueprint nodes resolve live too);
  - on error: `.wz-name-err` flips border+text to clay `#FF8855` and the
    exact error copy renders as a 10px mono line under the row (`fadeIn`,
    existing global keyframe); Initialize disables through the normal
    `canInit` path.
- `wizard.css`: `.wz-name` base + `::placeholder` + `:hover`/`:focus`
  (cyan500) + `.wz-name-err` (outranks focus) — base styles had to live in
  CSS (not inline) so the pseudo-states can cascade; all values are design
  tokens. NOTE: the brief said `rdh-` prefix, but wizard.css's established
  prefix is `wz-` (`rdh-` belongs to shell/flow) — kept `wz-` for
  consistency.
- `LiveBlueprint.tsx`: repo lines resolve names automatically via
  `blueprintRepoLine`; node keys switched `${repo}-${i}` → `${tag}-${i}` so
  renaming doesn't replay the popIn entrance every keystroke. No prop
  changes — `services` already carries `name`.
- Everything else pixel-identical; no design copy/data touched.

## Tests

- `wizard-model.test.ts`: **82** (was 60, +22): defaultServiceName units
  (unique/ordinal/unnamed-only counting/blank-as-unset/out-of-range) +
  v4-ordinal parity property (inline oracle, also covers serviceDir/repoName/
  no-error); serviceNameError units (valid slugs, 7 malformed shapes with
  exact copy, duplicates on both rows, custom-vs-default collision,
  case-sensitivity, mixed error-free); canInit/missingParts/initHint gate +
  rename→collision→fix flow; payload v5: trimmed-name-only unit with exact
  key sets, byte-identity literal pin, and 3 fast-check properties (names
  valid + resolved pairwise distinct under canInit; name present iff
  non-blank trimmed; no-name states byte-equal the inlined pre-v5 builder).
- `WizardScreen.test.tsx`: **21** (was 16, +5): placeholder ordinals +
  renumbering among unnamed; typing → blueprint node + `ramboll/…` hint +
  payload name; empty/cleared → no `name` key; invalid name → exact error
  copy + disabled + no POST + fix re-enables; duplicate names → both rows
  error + disabled until renamed.
- LiveBlueprint/CreatedScreen/ProvisioningOverlay suites untouched and green.

Gates: `npx tsc --noEmit` clean · full `npx vitest run` **304/304** (incl.
sibling areas' in-flight worktree state). Visually verified in the Vite
preview: clean/error/fix flows, placeholder renumbering, live blueprint
resolution, Initialize gating.
