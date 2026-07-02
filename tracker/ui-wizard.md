# Fleet-UI-Wizard — wizard + provisioning + created screens

Status: **DONE** — full hub suite green (14 files / 140 tests), `tsc --noEmit` clean.

## Created
- `hub/src/lib/wizard-model.ts` — pure logic ported verbatim from the design source
  (`Ramble IDP Hub MVP Design/Ramboll Developer Hub.dc.html`): `GBAS`, `PEOPLE` (10),
  `TYPES` (5), `PROV_STEPS` (6), `slugOf`, `repoName` (ordinal suffix only when a type
  repeats), `canInit`/`missingParts`/`initHint`, `blueprintName`, `createdRepos`
  (`ramboll/{slug}-{typeId}`, no ordinal — matches design lines 1143–1146),
  `createdSummary` (exact pluralization), `createdId` (`RMB-<GBA[0..2]>-043`),
  `initials`, `provRowState`/`isProvComplete`, `PROV_TICK_MS = 750`.
- `hub/src/lib/wizard-model.test.ts` — 31 tests incl. fast-check properties for
  `slugOf` (charset/no-edge-dash/idempotence), `repoName` ordinal numbering, and
  single-active-row provisioning invariant.
- `hub/src/components/wizard/WizardScreen.tsx` — wizard screen (design lines 396–488 +
  1044–1116 + 1214–1223): Identity / Contributors / Service components cards, exact
  px/rgba/copy, 750ms provisioning interval with cleanup (design 689–703), reports
  `CreatedProject` via `onCreated`.
- `hub/src/components/wizard/LiveBlueprint.tsx` — sticky right panel (design 491–536):
  pulsing dot, PROJECT node, connectors, service nodes / empty dashed state, CI/CD
  node, `PERKS` (design 1206–1212).
- `hub/src/components/wizard/ProvisioningOverlay.tsx` — fixed overlay (design 567–589 +
  1118–1139): `PROVISIONING · RMB-NEW`, done/active(spinner)/pending icon states.
- `hub/src/components/wizard/CreatedScreen.tsx` — created view (design 541–560):
  78px check circle, `{createdId} · PROVISIONED`, summary + repo chips, two CTAs
  (callbacks wired to `/` and `/projects` by the route).
- `hub/src/components/wizard/wizard.css` — hover/focus pseudo-states only (input focus
  ring, type-card hover, ✕ hover #FF8855, init-btn brightness(1.12), created button
  hovers #33ADEF / #66C1F3).
- Component tests: `WizardScreen.test.tsx` (fake-timer end-to-end provisioning flow,
  interval cleanup, chip toggles, ordinal repo names), `LiveBlueprint.test.tsx`,
  `ProvisioningOverlay.test.tsx`, `CreatedScreen.test.tsx`.

## Rewritten
- `hub/src/routes/new.tsx` — thin: `AppShell` + `WizardScreen`, holds
  `wizard|created` view state, navigates via TanStack router. Dropped the old
  `?blueprint=` search param and session redirect (old design).

## Deleted (old design)
- `src/components/Wizard.tsx`, `Wizard.test.tsx`, `StepBar.tsx`, `ProgressView.tsx`,
  `ProgressView.test.ts`
- `src/lib/wizard.ts`, `wizard.test.ts`, `payload.ts`, `payload.test.ts`
- `src/test/fixtures.ts` (removed entirely: `lib/api.test.ts` imports nothing from it;
  its only importer was the deleted `Wizard.test.tsx`). Empty `src/test/` dir removed.
- `api.ts` / `api.test.ts` / `types.ts` / `validation*` untouched, per contract.

## Notes for other agents
- `WizardScreen` consumes frozen contracts: `design/tokens.ts`, `design/icons.tsx`
  (`PathIcon` + `ICONS.check`), `components/shell/AppShell.tsx`, global keyframes
  (`popIn`/`pulseDot`/`spin`/`fadeIn`/`fadeUp` in `design/global.css`).
- `CreatedScreen`/`ProvisioningOverlay` are presentational; all timing/state lives in
  `WizardScreen` (`provStep`, -1 = idle; completion at `step > PROV_STEPS.length`,
  i.e. one 750ms tick after the last row turns done — matches design exactly).
