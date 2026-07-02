# Fleet-Hub-V3 — wire the wizard to the engine (v3)

**Status: ✅ complete** (agent hit the session usage limit after finishing the code; this tracker
entry + the final green run were completed by the orchestrator).

## What shipped
- `hub/src/lib/api.ts` — `listContributors()` (`GET /api/users`), `listServiceCatalog()`
  (`GET /api/service-catalog`), `initialize()` posting the v3 body (`layout`, `services`).
- `hub/src/lib/types.ts` — `Contributor`, `CatalogServiceType`/`CatalogServiceLang`,
  `InitializePayload` (+ v3 fields), `InitOutcome.repos`.
- `hub/src/lib/wizard-model.ts` — layout selection (multi-repo | monolith), service→payload
  mapping, contributors from the live directory; design copy preserved verbatim.
- `hub/src/components/wizard/*` — WizardScreen drives real provisioning: POST `/api/initialize`,
  the design's provisioning overlay plays while the engine runs, Created screen shows the real
  repo URLs from `outcome.repos`. Language chips disable unavailable blueprints from the catalog.
- Tests: WizardScreen suite extended to 18 (incl. exact v2 + v3 payload assertions against a mocked
  fetch, availability gating, error path). Full hub suite **183/183 green**, `tsc --noEmit` clean.

## Orchestrator fixes after the agent's session cap
- `src/lib/auth.ts` `storage()` now reads `window.localStorage` (Node 26 defines a broken global
  `localStorage` that shadowed jsdom's) and `vitest.setup.ts` installs a spec-shaped in-memory
  Storage when the jsdom env ships none — this was the single failing test (author fell back to
  "Hub user" because `saveSession` silently no-opped).
