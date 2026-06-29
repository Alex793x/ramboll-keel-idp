# Fleet-Engine-RS — `crates/keel-engine/`

**Status: ✅ done.** `Engine::initialize` + `Engine::list_projects` implemented; 11/11 tests green
(`cargo test -p keel-engine`); clippy clean; library + standalone build pass.

## Scope honored
- Touched **only** `crates/keel-engine/` (+ its `tests/`).
- Frozen public signatures unchanged (`new`, `with_catalog`, `initialize`, `list_projects`).
- No new external deps. Added `keel-github` as a **dev-dependency** only (for tests; it is already a
  workspace member). Added private modules `catalog` and `workflow`.

## Design — the 8-step workflow (`src/workflow.rs`)
`Engine::initialize` delegates to `workflow::run`. Every step emits exactly one `ProgressEvent`
whose `key` is the matching entry of `keel_core::WORKFLOW_STEPS`, steps `1..=8`, **always in
canonical order regardless of inputs**. Events are both forwarded live to the caller's `on_event`
callback and accumulated into the returned `InitOutcome.events` (full audit trail incl. `register`).

| # | key | action | status |
| - | --- | --- | --- |
| 1 | `signin` | no-op (caller already authed) | Done |
| 2 | `form` | `validate_basic()` → `load_manifest(blueprints_dir/<blueprint>)` → `validate_request` | Done |
| 3 | `render` | `keel_blueprint::render(...)` | Done (detail = file count) |
| 4 | `create_repo` | build `RepoSpec` (private, commit msg "chore: scaffold from Keel python-service blueprint"); create via provider | Done / **Skipped** if exists |
| 5 | `commit` | initial commit on main | Done / **Skipped** if exists |
| 6 | `branches` | `ensure_branches` (manifest or `[main,dev,staging]`); union into coords; `write_protection` per policy best-effort | Done |
| 7 | `seed_ci` | no-op (CI + docs ship in rendered tree) | Done |
| 8 | `register` | upsert JSON catalog row | Done |

`default_branch`/`branch_set` honor the manifest, falling back to `main` / `[main,dev,staging]`.
Protection is applied best-effort: a `write_protection` failure is swallowed (counted, not fatal).

## Idempotency
- **Repo:** step 4 calls `provider.repo_exists(owner, name)`. If true → steps 4+5 emit `Skipped`
  and coordinates are reused (provider's `create_repo` is itself idempotent, so reusing it to fetch
  coords is side-effect-free). No 2nd repo is ever created.
- **Catalog:** `register` upserts keyed on a **stable `catalog_id`** = `cat_<fnv1a(owner/name)>`
  (deterministic, dep-free). Re-running replaces the existing row → no duplicate. The persisted row
  is the *complete* outcome (all 8 events), so `list_projects` round-trips `initialize`'s return.
- Re-running still emits all 8 events (with `Skipped` on create/commit).

## Catalog format (`src/catalog.rs`)
Single JSON array of `InitOutcome` at `Engine::catalog_path()`. `read` → empty vec if absent or
whitespace-only. `write` is atomic (temp file + rename) and creates parent dirs. `upsert` is keyed
on `catalog_id`. `list_projects` = `catalog::read(catalog_path)`.

## Tests (`cargo test -p keel-engine` → 11 passed)
Fixture blueprint at `crates/keel-engine/tests/fixtures/fixture-service/` (mirrors the real
`keel/v1` schema): `blueprint.yaml` + `template/` with `README.md.j2` (rendered), `ci.yml`
(verbatim, contains `${{ github.ref }}` to prove GH expressions survive), `CODEOWNERS.j2`.
- `src/catalog.rs` unit tests (5): missing→empty, parent-dir creation + roundtrip, upsert replaces
  same id, upsert appends distinct ids, `catalog_id` stable & distinct.
- `tests/initialize.rs` (6): all-8-steps-in-order; initialize-twice idempotent (1 repo, 1 row,
  2nd run Skipped create/commit); `list_projects` round-trips registered outcomes; outcome carries
  full audit trail + dev/staging branches; **proptest** events-always-canonical-order (over project
  name × service kind); **proptest** idempotent-under-repeat.

## Blueprint-crate dependency note
`initialize` calls `keel_blueprint::{load_manifest,validate_request,render}`. At run time the
blueprint crate was **already fully implemented** (not `todo!()`), so the initialize tests run green
for real — no block. If it had still been stubbed, the tests would panic at the `form`/`render`
step; they are written to be correct regardless, and the orchestrator runs the final workspace test.

## Build note (not mine)
`cargo build --workspace` currently fails on `crates/keel-cli` (missing `src/lib.rs`) — that crate
is **Fleet-Api-RS**'s subtree, unrelated to keel-engine. `cargo build -p keel-engine` and
`cargo test -p keel-engine` are green.

## MemTrace
- `fleet_publish_intent` (repo `keel`, agent `fleet-engine-rs`, branch `main`) → no conflicts,
  intent_id `01KW8C2E8CDBN9DW85YHYJN8P6`.
- `fleet_record_episode` recorded at completion.
