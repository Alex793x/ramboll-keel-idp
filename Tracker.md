# Keel — Build Tracker (v2: Rust engine + TanStack Start hub)

Master execution tracker. Plan in `SPEC.md`. Per-area details in `tracker/<area>.md`.

**Branch model (also enforced by the product):** `main`/`dev`/`staging`; working branches
`feature/` · `bug/` · `hotfix/`.

**Status: ✅ COMPLETE** — all eight fleets landed, integrated, and verified end-to-end (real `gh`).

---

## Fleet roster & outcome

| # | Area | Owner agent | Subtree | Status | Tests |
| --- | --- | --- | --- | --- | --- |
| 1 | Blueprint engine (Rust) | Fleet-Blueprint-RS | `crates/keel-blueprint/` | ✅ | 22 (proptest) |
| 2 | GitHub provider (Rust) | Fleet-Github-RS | `crates/keel-github/` | ✅ | 12 (+1 ignored gh) |
| 3 | Workflow engine (Rust) | Fleet-Engine-RS | `crates/keel-engine/` | ✅ | 11 (proptest) |
| 4 | HTTP API + CLI (Rust) | Fleet-Api-RS | `crates/keel-api/`, `keel-cli/` | ✅ | 14 + 13 |
| 5 | Hub UI (TanStack Start) | Fleet-Hub | `hub/` | ✅ | 38 (Vitest+fast-check) |
| 6 | Python blueprint refine | Fleet-Blueprint-PY | `blueprints/python-service/` | ✅ | green-from-birth |
| 7 | Reusable + Keel CI | Fleet-CI | `.github/` | ✅ | yaml-valid |
| 8 | Platform docs | Fleet-Docs | `README/architecture/docs` | ✅ | links verified |

`keel-core` (Phase 0): 6 tests incl. proptests. Every agent recorded a MemTrace fleet episode
(all conflict class **A** — additive/safe, no conflicts).

---

## Milestones

- [x] M0 — toolchain verified (Rust 1.96, Node 26/bun, gh authed `Alex793x` w/ repo+workflow), reset.
- [x] M1 — Phase 0 foundation green (workspace compiles; core + FakeProvider tested).
- [x] M2 — v2 baseline committed + MemTrace reindexed (`keel`, 68 symbols).
- [x] M3 — 8 fleets dispatched (publish intent → TDD → record episode → tracker/<area>.md).
- [x] M4 — all areas ✅; `cargo test --workspace` (17 suites) + hub Vitest (38) green;
      `cargo fmt --check` + `cargo clippy -D warnings` clean.
- [x] M5 — **E2E**: `keel-cli init` (department=water, users=u-sofia,u-tomas) created a real private
      repo `Alex793x/keel-e2e-0d21`; verified `main/dev/staging`, CODEOWNERS `* @water
      @sofia-ramboll @tomas-ramboll`, 3 AI skills, 3 reusable workflows; idempotent re-run skips
      create/commit (1 commit). Cloned + green-from-birth: pytest 12 / ruff / black / mypy all pass.
- [x] M6 — Final commit; Definition of Done (SPEC §10) satisfied.

---

## Orchestrator integration fixes (post-fleet)

- **Renderer trailing newline** — MiniJinja defaults `keep_trailing_newline=false`, stripping the
  final newline of every rendered file → `ruff`/`black` W292 in generated repos. Fixed in
  `keel-blueprint/src/renderer.rs` (`env.set_keep_trailing_newline(true)`). This is the difference
  between the Python-jinja2 proxy (clean) and the real MiniJinja engine; now both are clean.
- **CI gate cleanups** — `cargo fmt --all`; fixed `clippy::field_reassign_with_default` and removed
  an unused test helper in `keel-blueprint` so `clippy -D warnings` passes.

---

## Definition of Done (SPEC §10) — verified

- [x] `cargo build` + `cargo test` green across the workspace (17 suites); clippy + fmt clean.
- [x] `cd hub && npm test` (38) green incl. fast-check; `npm run build` + `tsc --noEmit` pass.
- [x] `keel-cli init` with a mocked department + users creates a real GitHub repo with the full
      Python blueprint tree, `main/dev/staging`, and CODEOWNERS reflecting the selection.
- [x] Generated repo passes green-from-birth (cloned from GitHub: pytest/ruff/black/mypy clean).
- [x] `keel-api` serves the §3.5 endpoints (verified live); the hub wizard drives dept→users→submit.
- [x] Catalog + audit recorded; blueprint version stored.

---

## Adversarial review & remediation (post-fleet)

A 4-dimension adversarial verification workflow (25 agents) raised **21 findings**, each
skeptically re-checked. Outcome:

**Fixed (correctness/quality):**
- **[blocker] Generated-repo CI was red** — reusable workflows used `uses: ./.github/actions/setup-python-env`,
  which resolves against the *caller* repo (which lacks it). **Inlined** setup into each reusable
  workflow (self-contained for remote callers); removed the composite action; corrected `.github/README.md`.
- **[major] `branch-protection.json` durable record was promised but never written** — the **engine** now
  always commits it (rendered from `manifest.repository.protect`); docs reconciled.
- **[major] Tautological integration-test assertions** — `tests/python_service.rs` now asserts CODEOWNERS
  owners + the reusable-workflow `uses:` ref **unconditionally**.
- **[major] `GhCliProvider` hardcoded `default_branch:"main"`** — now uses `spec.default_branch`.
- **[major] Hub had no submit-failure test** — added a Vitest case driving a 500 and asserting the
  `role="alert"` banner + re-enabled submit (Vitest now 39).
- **[minor] CODEOWNERS bare team slug invalid on a personal account** — owners are now the selected
  users' `@github_login`s (always valid); the department is documented in a comment.
- **[minor] `repo_exists` conflated not-found with auth/network errors** — only 404/"could not resolve"
  is treated as absent; other failures surface as `KeelError::Github`.
- **[minor] empty `?blueprint=` left the wizard unsubmittable** — coerced to the default in `new.tsx` + Wizard.
- **[minor/nit] Hub a11y** — DepartmentStep uses native radios; load errors use `role="alert"`; name input
  has `aria-describedby`.
- **[nit] docs/labels** — `keel/v1`→`keel/v2` docstrings; step-5 event uses the actual branch; worker help
  reworded; git-ci-governance skill regex aligned to the enforced rule.

**Documented as known MVP limitations (not fixed — acceptable for the MVP):**
- **D-07** Reusable-CI ref is `Alex793x/keel@main` (personal account, moving ref) — the test account
  authorised for this build. Production: move to a Ramboll org + a version tag (`@v1`).
- Re-running `initialize` for an existing repo does **not** reconcile a changed department/user
  selection into CODEOWNERS (create/commit are skipped). Documented; reconciliation is future work.
- `required_checks: [build, test, validate]` won't match GitHub's composed reusable-workflow check
  contexts; only matters once protection is actually *enforced* (an org). Noted for the org rollout.

---

## UI redesign port (v2.1 — "Ramboll Developer Hub" control room)

Ported `Ramble IDP Hub MVP Design/Ramboll Developer Hub.dc.html` **one-to-one** into the TanStack
Start hub as typed React components via a 5-agent MemTrace fleet (all episodes class A):

| Agent | Delivered |
| --- | --- |
| Fleet-UI-Foundation | `design/tokens.ts` (22 exact hexes, CYAN/OCEAN/spot scales), `global.css` (9 verbatim keyframes), `PathIcon`/`SearchIcon`, `useClock`, fonts (Nunito + JetBrains Mono), logo assets, root route |
| Fleet-UI-Shell | Sign-in ("Continue with Microsoft", drift orbs, grid mask) + `AppShell` (248px sidebar, nav model + SOON chips, ⌘K topbar, live CET clock) |
| Fleet-UI-HomeProjects | Home (greeting/stats/projects/updates/recommended) + Projects table + exact demo data |
| Fleet-UI-KB | `diagram-engine.ts` (flow DAG + sequence layout, 10 semantic KINDS), `docs-data.ts` (3 full docs), KB home + doc reader (rich text, callouts, code copy, steps, tables, interactive diagrams, TOC) |
| Fleet-UI-Wizard | Wizard (Identity/Contributors/Service components), Live Blueprint, 6-step provisioning overlay (750ms), Created screen; pure `wizard-model` with fast-check |

**Gates:** `tsc` clean · Vitest **140/140** · `npm run build` green. **Visually verified live**
(Claude Preview): sign-in → home → projects → KB → doc reader with rendered diagrams → wizard →
provisioning → created, all matching the design.

**Findings & decisions:**
- **D-09** The design source's `ramboll-logo-white.png` is a blank PNG (0 visible pixels in every
  copy in the design folder — the prototype itself couldn't render it). Reconstructed faithfully by
  recoloring the real cyan wordmark's pixels white (alpha preserved). Design folder left pristine.
- **D-10** The new wizard is a **design-faithful port**: multi-service blueprints (FE/API/WK/DP/INF),
  GBAs, contributors, *simulated* 6-step provisioning — exactly as the prototype. The keel-api
  client stays in `hub/src/lib/api.ts`; wiring the multi-service wizard to the Rust engine requires
  backend blueprint work and is deliberate follow-up, not silent drift.
- Old light-theme UI (AppHeader/Footer, `rb-*` styles, dept/users wizard) removed; faithful quirks
  ported verbatim and documented in `tracker/ui-*.md` (e.g. the literal `3 GBAS` header).

---

## v3 — multi-service projects, monolith layout & smart selective CI

**Status: ✅ complete** — 6 fleets (SPEC §12–§15), all MemTrace episodes class A. Per-area detail in
`tracker/{engine,apicli,monoci,blueprints,hub}-v3.md`.

| Area | Delivered | Verified |
| --- | --- | --- |
| Engine (Rust) | `workflow/{legacy,multi,mono}.rs`, `derive_context_v3`, `render_with_context` | 19 workspace suites; legacy tests unmodified; 3 new proptests |
| API + CLI | `/api/users`, `/api/service-catalog`, additive v3 `initialize` body; `--layout` `--services` | legacy v2 bodies byte-identical (equality-tested) |
| Service blueprints | 8 under `blueprints/services/`: api-{python,node,dotnet}, wk-{python,go}, dp-python, fe-react, inf-terraform | 5 local-green; dotnet/go/terraform authored + CI-pending (no local toolchain) |
| Monolith root | `blueprints/monolith-root/` + `detect_services.py` + detect→gate→matrix `ci.yml` + `monorepo-selective-ci` skill | 13-property hypothesis suite ships in every monolith and runs green |
| Hub wizard | wired to the real engine: live contributors/catalog, layout toggle, real repos + URLs | 183/183 Vitest, tsc clean |
| **E2E (real gh)** | multi-repo → `Alex793x/keel-v3m-15ef-{api,fe}`; monolith → `Alex793x/keel-v3s-15ef` | branches, CODEOWNERS, `keel.services.json`, smart ci.yml verified on GitHub |

**Smart selective CI proven** (local demos on the rendered monolith): `services/api/` change →
build `[api]` only · `services/fe/` → `[fe]` · shared path (`.github/`) → ALL (`reason=shared:`) ·
README-only → **zero** services · empty diff → safe fallback ALL · `depends_on` closure included.
Hypothesis found a real bug during authoring (shared-path reason was input-order-dependent) — fixed
in the resolver, not the test.

Env bugs fixed in integration: Node 26's broken global `localStorage` shadowing jsdom (auth reads
`window.localStorage`; vitest setup installs an in-memory Storage when the env has none).

---

## Decisions log

- **D-08** Memtrace-driven coherence pass (style fingerprint + centrality). Extracted the duplicated
  mock catalog + resolution from `keel-api`/`keel-cli` into `keel_core::catalog` (`MockCatalog`,
  `Selection`, `resolve`); split the `keel-api` 657-line god-file into `state`/`dto`/`routes`.
  Result: 0 `MockData` duplication; rust `try_op_share` 0.42→0.53; unwraps 126→112 (0 in production).
  Style conventions recorded in agent memory ([[keel-rust-style-conventions]]).


- **D-01** Engine in **Rust** (6-crate workspace), hub in **TanStack Start** — per v2 directive;
  aligns with whitepaper §4.1.
- **D-02** GitHub I/O behind the `RepoProvider` trait. **`OctocrabProvider`** (typed `octocrab` SDK)
  is now implemented as the recommended/production-leaning provider (whitepaper Appendix A), selected
  by `keel-cli --octocrab`; auth via `gh auth token` for the MVP (GitHub App is the future step).
  Alongside it: `GhCliProvider` (real `gh`), `LocalDirProvider` (hermetic local), `FakeProvider` (tests).
  Proven end-to-end: `Alex793x/keel-oct-6bde` created via the SDK with one clean commit + main/dev/staging.
- **D-03** Departments + users **mocked** in `fixtures/mock-data.json`; selection drives CODEOWNERS.
- **D-04** Catalog/audit persisted as **JSON** (no DB infra in MVP).
- **D-05** Retained from v1 (validated): Python `blueprints/python-service/` + reusable `.github/`.
- **D-06** E2E repo `Alex793x/keel-e2e-0d21` left in place (token lacks `delete_repo` scope);
  delete with `gh auth refresh -s delete_repo && gh repo delete Alex793x/keel-e2e-0d21 --yes`.
- **D-07** Generated repos' CI references `Alex793x/keel/...reusable-*.yml@main`; those Actions go
  green once Keel itself is published to `Alex793x/keel`.
