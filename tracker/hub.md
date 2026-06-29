# Area 5 — Hub UI (TanStack Start) · `hub/`

Owner: **Fleet-Hub** · Status: ✅ **done** · Subtree: `hub/` (exclusive)

The self-service project-initialization UI for the Ramboll Developer Platform
(SPEC §4). Drives the Rust `keel-api` (SPEC §3.5). Ramboll-branded; tagline
"Bright ideas. Sustainable change."

---

## Stack & pinned versions

Full **TanStack Start** app (React 19 + TypeScript + Vite) — **no fallback was
needed**; `npm run build` and `npm test` both green.

| Concern | Package | Version |
| --- | --- | --- |
| Start framework | `@tanstack/react-start` | 1.168.26 |
| Router | `@tanstack/react-router` | 1.170.16 |
| UI | `react` / `react-dom` | 19.2.7 |
| Language | `typescript` | 5.9.3 |
| Bundler / dev server | `vite` | 7.3.6 |
| React Vite plugin | `@vitejs/plugin-react` | 5.2.0 |
| Test runner | `vitest` | 4.1.9 (jsdom env) |
| Component testing | `@testing-library/react` | 16.3.2 |
| | `@testing-library/user-event` | 14.6.1 |
| | `@testing-library/jest-dom` | 6.9.1 |
| Property testing | `fast-check` | 4.8.0 |
| DOM | `jsdom` | 29.1.1 |

Package manager: **npm** (Node 26, npm 11). Clean install, 0 vulnerabilities.

### Version notes / pinning decisions
- **`@vitejs/plugin-react` pinned to 5.2.0**, not 6.x: v6 requires Vite ^8, and
  the latest TanStack Start (1.168) peers on Vite `>=7.0.0`. v5.2.0 supports Vite
  4/5/6/7/8, so it bridges Start + Vite 7 cleanly. (Vite 8 is out but Start's
  toolchain is most-tested on 7; pinning 7.3.6 is the conservative choice.)
- **TypeScript pinned to 5.9.3**, not 6.x (6.0 is brand new; 5.9 is the proven
  line for this toolchain).
- The TanStack Start vite plugin is imported as
  `import { tanstackStart } from "@tanstack/react-start/plugin/vite"`.
- The router entry (`src/router.tsx`) **must export `getRouter()`** — the Start
  plugin calls it on both server (SSR) and client (hydration).
- `src/routeTree.gen.ts` is **auto-generated** by the plugin on dev/build and is
  gitignored.

---

## Routes (SPEC §4)

| Route | Purpose |
| --- | --- |
| `/login` | Mock auth (documented OIDC stand-in): any `@ramboll.com` email + non-empty password; session in `localStorage`; others rejected. |
| `/` | Catalog: hero + a card per blueprint from `GET /api/blueprints`. `python-service` is **live**; others render **"coming soon"**. CTA → `/new`. |
| `/new` | The 4-step **wizard**: (1) department `GET /api/departments` → (2) users `GET /api/departments/:id/users` (multi-select) → (3) details (project_name + pattern hint, service_kind, description, author) → (4) review & submit `POST /api/initialize`, then a **progress view** of the 8 workflow steps + the resulting repo URL/branches. Requires a session. |
| `/projects` | Table from `GET /api/projects`. |

API base URL from `import.meta.env.VITE_KEEL_API_URL` (default
`http://localhost:8787`). `.env.example` provided.

---

## Brand (SPEC §8)

`src/styles/tokens.css` defines the **exact** `--rb-*` variables + the spec's
font stacks (sans/mono). Navy header bar "Ramboll Developer Platform · Keel" with
a gold (`--rb-amber`) rule, blue (`--rb-blue`) headings, cyan (`--rb-cyan`)
primary buttons, hairline (`--rb-border`) cards, footer with the tagline.

---

## Pure, tested modules (TDD + property tests)

Logic is extracted out of components so it is exhaustively testable:

| Module | What | Tests |
| --- | --- | --- |
| `src/lib/validation.ts` | `validateProjectName` (regex `^[a-z][a-z0-9-]{2,40}$`) | unit + 4 fast-check properties (valid names pass, malformed fail, agrees with regex, uppercase fails) |
| `src/lib/wizard.ts` | wizard state machine (pure reducer + `canAdvance`/`canSubmit`/`canReach`) | unit + **property: new department resets users**; **property: cannot reach submit without ≥1 user + valid name** (over arbitrary states *and* over arbitrary reducer-action sequences) |
| `src/lib/payload.ts` | `buildInitializePayload` (state → `POST /api/initialize` body) | unit + **property: output always has non-empty `user_ids`, valid `project_name`, known `service_kind`** |
| `src/lib/api.ts` | `KeelApi` typed fetch wrapper (injectable fetch) | unit with mocked `fetch` (URLs, encoding, method/headers/body, ApiError) |
| `src/lib/auth.ts` | mock session / OIDC stand-in | unit + property (`@ramboll.com` accepted) |
| `src/components/ProgressView.tsx` | `mergeSteps` (events → 8 canonical step rows) | unit |
| `src/routes/index.tsx` | `isBlueprintLive` | unit |
| `src/components/Wizard.tsx` | **integration**: mount wizard → select dept → select users → fill details → submit → assert the **exact** `POST /api/initialize` payload (mock fetch); also asserts dept-change resets users and Next-gating | 3 Testing-Library tests |

---

## How to run

```bash
cd hub
npm install
npm run dev        # http://localhost:3000 (Vite + SSR)
npm run build      # production build → dist/client + dist/server
npm test           # Vitest run (unit + property + integration)
npm run typecheck  # tsc --noEmit
```

For live data, run the Rust API alongside: `cargo run -p keel-api` (`:8787`).

---

## Verification results

- `npm test` → **8 files, 38 tests, all passing** (incl. all fast-check property
  tests and the wizard integration/E2E test).
- `npm run build` → **success** (client: 161 modules; SSR: 69 modules; built
  `dist/client` + `dist/server`). The SSR import warnings are harmless
  tree-shaking notices from the TanStack libraries themselves.
- `npm run typecheck` → **clean** (no errors).
- Dev server verified: `GET /` and `GET /login` return 200 and SSR the
  Ramboll-branded chrome (navy header + brand wordmark + hero + tagline) into the
  initial HTML.

## Fallback

**None.** Full TanStack Start works end-to-end (SSR build + dev server). No
fallback to plain React + Vite was required, so no migration steps are needed.

## MemTrace

- START: `fleet_publish_intent` repo_id `keel`, agent_id `fleet-hub`, branch
  `main`, touched `["hub::wizard","hub::api-client"]` — published, no conflicts
  (`coordination.advice: "clear"`, intent_id `01KW8C47KNC40KG976Q6H8P9M4`).
- END: `fleet_record_episode` recorded (see below).
