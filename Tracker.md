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

## Decisions log

- **D-01** Engine in **Rust** (6-crate workspace), hub in **TanStack Start** — per v2 directive;
  aligns with whitepaper §4.1.
- **D-02** GitHub I/O behind the `RepoProvider` trait — `GhCliProvider` (real `gh`), `LocalDirProvider`
  (hermetic local), `FakeProvider` (tests). octocrab + GitHub App is the documented production path.
- **D-03** Departments + users **mocked** in `fixtures/mock-data.json`; selection drives CODEOWNERS.
- **D-04** Catalog/audit persisted as **JSON** (no DB infra in MVP).
- **D-05** Retained from v1 (validated): Python `blueprints/python-service/` + reusable `.github/`.
- **D-06** E2E repo `Alex793x/keel-e2e-0d21` left in place (token lacks `delete_repo` scope);
  delete with `gh auth refresh -s delete_repo && gh repo delete Alex793x/keel-e2e-0d21 --yes`.
- **D-07** Generated repos' CI references `Alex793x/keel/...reusable-*.yml@main`; those Actions go
  green once Keel itself is published to `Alex793x/keel`.
