# Keel — Build Tracker (v2: Rust engine + TanStack Start hub)

Master execution tracker. **Single source of truth for alignment.** Plan in `SPEC.md`.
Each fleet agent owns one subtree and writes its live status to `tracker/<area>.md` (never edits
this file). The orchestrator consolidates the table below.

**Branch model (also enforced by the product):** `main`/`dev`/`staging`; working branches
`feature/` · `bug/` · `hotfix/`.

---

## Phase 0 — foundation (orchestrator) ✅

- [x] v1 (Python) removed; Rust + TanStack chosen (matches whitepaper §4.1).
- [x] `SPEC.md` v2 with frozen crate contracts (§3) + HTTP API (§3.5) + E2E (§5).
- [x] Cargo workspace + **`keel-core` fully implemented** (6 tests incl. proptests).
- [x] Compiling **stubs** for `keel-blueprint`, `keel-github`, `keel-engine`, `keel-api`, `keel-cli`
      with frozen public APIs. `cargo build --workspace` ✅, `cargo test --workspace` ✅.
- [x] **`keel-github::FakeProvider` fully implemented** (decouples engine tests from the gh agent).
- [x] Canonical mocked dept/users at `fixtures/mock-data.json` (read by keel-api; Hub via API).

---

## Fleet roster & area ownership (all parallel; frozen public signatures must not change)

| # | Area | Owner agent | Subtree (exclusive) | Status |
| --- | --- | --- | --- | --- |
| 1 | Blueprint engine (Rust) | Fleet-Blueprint-RS | `crates/keel-blueprint/` | ⏳ pending |
| 2 | GitHub provider (Rust) | Fleet-Github-RS | `crates/keel-github/` (`GhCliProvider` only) | ⏳ pending |
| 3 | Workflow engine (Rust) | Fleet-Engine-RS | `crates/keel-engine/` | ⏳ pending |
| 4 | HTTP API + CLI (Rust) | Fleet-Api-RS | `crates/keel-api/`, `crates/keel-cli/` | ⏳ pending |
| 5 | Hub UI (TanStack Start) | Fleet-Hub | `hub/` | ⏳ pending |
| 6 | Python blueprint refine | Fleet-Blueprint-PY | `blueprints/python-service/` | ⏳ pending |
| 7 | Reusable + Keel CI | Fleet-CI | `.github/` | ⏳ pending |
| 8 | Platform docs | Fleet-Docs | `README.md`, `architecture.md`, `docs/` | ⏳ pending |

Legend: ⏳ pending · 🔧 in progress · ✅ done · ⚠️ blocked

---

## Milestones

- [x] M0 — toolchain verified (Rust 1.96, Node 26/bun, gh authed `Alex793x` w/ repo+workflow), reset.
- [x] M1 — Phase 0 foundation green (workspace compiles + core/github tests pass).
- [ ] M2 — First commit (v2 baseline) + MemTrace reindex confirmed.
- [ ] M3 — Fleets dispatched (each: publish intent → TDD build → record episode → tracker/<area>.md).
- [ ] M4 — All eight areas ✅; `cargo test --workspace` + `hub` Vitest green.
- [ ] M5 — Integration: `keel-api` serves; **E2E** `keel-cli init` creates a real repo via `gh`,
      verified with `gh repo view`, then cleaned up; generated repo passes green-from-birth gate.
- [ ] M6 — Final commit; Definition of Done (SPEC §10) satisfied.

---

## Integration contracts (must hold — see SPEC)

- **Crate APIs** frozen in SPEC §3 (keel-core types/traits; blueprint/github/engine signatures).
- **HTTP API** SPEC §3.5 — keel-api exposes, hub consumes.
- **Mock data** `fixtures/mock-data.json` — keel-api reads (`include_str!`), hub via API at runtime.
- **Render context** for the Python blueprint includes `department` (with `team_slug`) and `users`
  (each with `github_login`) so CODEOWNERS reflects the selection.
- **Reusable CI** `Alex793x/keel/.github/workflows/reusable-{build,test,validate}.yml@main`.

---

## Live area notes (consolidated by orchestrator from `tracker/<area>.md`)

- 1 Blueprint-RS: _pending_ · 2 Github-RS: _pending_ · 3 Engine-RS: _pending_
- 4 Api-RS: _pending_ · 5 Hub: _pending_ · 6 Blueprint-PY: _pending_ · 7 CI: _pending_ · 8 Docs: _pending_

---

## Decisions log

- **D-01** Engine in **Rust** (Cargo workspace, 6 crates), hub in **TanStack Start** — per the
  user's v2 directive; aligns with whitepaper §4.1 ("Why Rust for the control plane").
- **D-02** GitHub integration via the user's **`gh` CLI** (`GhCliProvider`) for testing; octocrab +
  GitHub App is the documented production path. I/O is behind the `RepoProvider` trait.
- **D-03** Departments + users are **mocked** (`fixtures/mock-data.json`); selection drives CODEOWNERS.
- **D-04** Catalog/audit persisted as **JSON** (no DB infra in MVP).
- **D-05** Retained from v1 (validated, language-agnostic): the Python `blueprints/python-service/`
  golden path and `.github/` reusable workflows — refined, not rebuilt.
- **D-06** E2E creates a **real private repo** under `Alex793x` named `keel-e2e-<project>`, verified
  then deleted; `Alex793x` is included as a selectable user so CODEOWNERS has a valid owner.
