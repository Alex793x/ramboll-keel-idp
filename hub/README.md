# Keel Hub

The self-service project-initialization UI for the **Ramboll Developer Platform**
(SPEC §4). Built with **TanStack Start** (React 19 + TypeScript + Vite). Tagline:
*Bright ideas. Sustainable change.*

## Stack

| Concern | Choice |
| --- | --- |
| Framework | TanStack Start (`@tanstack/react-start` 1.168) + `@tanstack/react-router` 1.170 |
| UI | React 19.2, TypeScript 5.9 |
| Bundler / dev server | Vite 7.3 |
| Tests | Vitest 4.1 (jsdom) + `@testing-library/react` 16 + `fast-check` 4 |

## Routes (SPEC §4)

- `/login` — mock auth (OIDC stand-in): any `@ramboll.com` email + non-empty password.
- `/` — catalog: hero + a card per blueprint from `GET /api/blueprints` (Python live; others "coming soon").
- `/new` — the 4-step wizard: department → users → details → review & submit → live progress (8 steps) + repo URL.
- `/projects` — table from `GET /api/projects`.

The API base URL comes from `VITE_KEEL_API_URL` (default `http://localhost:8787`).
Copy `.env.example` to `.env` to override.

## Run

```bash
npm install
npm run dev      # dev server on http://localhost:3000
npm run build    # production build (client + SSR) into dist/
npm test         # Vitest (unit + property + integration)
npm run typecheck
```

Start the Rust API alongside for live data: `cargo run -p keel-api` (default `:8787`).

## Architecture

Pure logic is extracted into testable modules under `src/lib/` and exhaustively
covered (Vitest + fast-check). The React routes/components are thin shells over them:

- `lib/validation.ts` — `validateProjectName` (regex `^[a-z][a-z0-9-]{2,40}$`).
- `lib/wizard.ts` — the wizard state machine (pure reducer + `canAdvance`/`canSubmit`/`canReach`).
- `lib/payload.ts` — `buildInitializePayload` (wizard state → `POST /api/initialize` body).
- `lib/api.ts` — `KeelApi`, a thin typed `fetch` wrapper (injectable fetch for tests).
- `lib/auth.ts` — mock session (documented OIDC stand-in).
- `components/Wizard.tsx` — the wizard UI; the integration test mounts it and asserts the exact submitted payload.
