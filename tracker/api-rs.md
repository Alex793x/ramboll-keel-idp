# Fleet-Api-RS — keel-api (HTTP) + keel-cli (E2E driver)

Status: ✅ done — both crates implemented, build green, tests green (no network), clippy clean.

Exclusive subtree: `crates/keel-api/`, `crates/keel-cli/`. No frozen signatures changed elsewhere.
No new external deps beyond those already declared.

---

## keel-api (axum) — SPEC §3.5

Structured as a testable **library** (`src/lib.rs`, crate `keel_api`) plus a thin binary
(`src/main.rs`). Mock data is embedded via `include_str!("../../../fixtures/mock-data.json")` and
parsed once into typed structs at startup. Router has `tower_http::cors::CorsLayer::permissive()`.

Endpoints:

| Method · Path | Returns |
| --- | --- |
| `GET /api/health` | `{"status":"ok"}` |
| `GET /api/departments` | `[{id,name,team_slug}]` (no `users` leaked) |
| `GET /api/departments/:id/users` | `[{id,name,email,github_login}]`; **404 JSON `{error}`** if dept unknown |
| `GET /api/blueprints` | scans blueprints dir (`KEEL_BLUEPRINTS_DIR`, default `blueprints`), `keel_blueprint::load_manifest` each subdir → `[{name,title,description,version,parameters}]` (subdirs without a loadable manifest are skipped; missing dir ⇒ `[]`) |
| `POST /api/initialize` | body `{project_name,blueprint,department_id,user_ids[],service_kind,description,author}` → `{events:[ProgressEvent], outcome:InitOutcome}`; 4xx/5xx JSON `{error}` on failure |
| `GET /api/projects` | `engine.list_projects()` |

Key design points (as specified):
- **PURE resolution** `resolve_init_request(&MockData, &InitializeBody) -> Result<InitRequest>` —
  resolves `department_id` + `user_ids` against the mock catalog, parses `service_kind`, runs
  `InitRequest::validate_basic`. No I/O. Unit-tested exhaustively.
- **No provider in shared state** (`FakeProvider`/gh providers aren't `Sync`). The `/api/initialize`
  handler constructs `keel_github::GhCliProvider::new(owner)` **inside** the handler and runs
  `engine.initialize` in `tokio::task::spawn_blocking` (blocking subprocess IO), collecting events.
- `AppState` holds `Arc<MockData>`, `Arc<Engine>` (`Engine::new(blueprints_dir, owner)`),
  blueprints_dir, owner. Built from env in `AppState::from_env()`.
- `tracing_subscriber` initialized in `main` (honors `RUST_LOG`).
- Error → HTTP mapping: `Validation` ⇒ 400, `Conflict` ⇒ 409, `Render`/`Github`/`Io` ⇒ 500,
  body `{"error": "..."}`.

Env overrides: `KEEL_API_ADDR` (default `0.0.0.0:8787`), `KEEL_BLUEPRINTS_DIR` (default
`blueprints`), `KEEL_OWNER` (default `Alex793x`).

Run the API:
```bash
cargo run -p keel-api                       # binds 0.0.0.0:8787
KEEL_API_ADDR=127.0.0.1:8787 cargo run -p keel-api
```

Verified live over HTTP: health, departments (3-field items, no leaked users), users (+404 on
unknown), blueprints (returns `python-service`).

---

## keel-cli (clap) — the E2E driver, SPEC §3.6

Also library (`src/lib.rs`, crate `keel_cli`) + thin binary. Mock data loaded at runtime from
`fixtures/mock-data.json` relative to CWD, falling back to an embedded `include_str!` copy.

```
keel-cli init --project <name> --department <id> --users <id,id,...>
              --service-kind <rest-api|worker> --description <s> --author <s>
              [--owner Alex793x] [--blueprints <dir>] [--local <dir>] [--dry-run]
```

Provider selection (`InitArgs::provider_choice`): `--dry-run` ⇒ `FakeProvider` (wins over
`--local`); `--local <dir>` ⇒ `keel_github::LocalDirProvider::new(dir)` (real local git repo, no
`gh`/network — creates `<dir>/<project>`); otherwise ⇒ `GhCliProvider::new(owner)`. Each
`ProgressEvent` is streamed to **stderr** as it arrives; the final `InitOutcome` is pretty-JSON to
**stdout**. Exit code 1 on error.

`resolve_request(&MockData, &InitArgs) -> anyhow::Result<InitRequest>` mirrors the API's pure
resolution.

### Commands the orchestrator should run for the E2E

Dry run (no writes, no network — fastest sanity check):
```bash
cargo run -p keel-cli -- init \
  --project keel-e2e-demo --department platform-engineering --users u-alex \
  --service-kind rest-api --description "E2E demo" --author "Alex Holmberg" --dry-run
```

Local real-git E2E (no gh, hermetic; green-from-birth verification):
```bash
cargo run -p keel-cli -- init \
  --project keel-e2e-demo --department platform-engineering --users u-alex,u-bo \
  --service-kind worker --description "E2E demo" --author "Alex Holmberg" \
  --local /tmp/keel-e2e
# repo is created at /tmp/keel-e2e/keel-e2e-demo
git -C /tmp/keel-e2e/keel-e2e-demo log --oneline   # one clean initial commit on main
git -C /tmp/keel-e2e/keel-e2e-demo branch          # main, dev, staging
```

Real GitHub E2E (creates a real private repo under Alex793x via `gh`):
```bash
cargo run -p keel-cli -- init \
  --project keel-e2e-demo --department platform-engineering --users u-alex \
  --service-kind rest-api --description "E2E demo" --author "Alex Holmberg" \
  --owner Alex793x
# verify, then delete:
gh repo view Alex793x/keel-e2e-demo
gh api repos/Alex793x/keel-e2e-demo/branches --jq '.[].name'
gh repo delete Alex793x/keel-e2e-demo --yes
```

Verified end-to-end locally (dependencies now built): `--dry-run` emits all 8 ordered events and
`FakeProvider` records 1 repo; `--local` produced a real git repo with `main`/`dev`/`staging`, one
clean initial commit, 32 files, and `CODEOWNERS` = `* @platform-engineering @Alex793x` reflecting
the selected department + user.

---

## Tests (`cargo test -p keel-api -p keel-cli`, no network)

- **keel-api (14 tests, all pass):**
  - Handler tests via `tower::ServiceExt::oneshot`: `/api/health`, `/api/departments` (asserts no
    leaked `users`, `platform-engineering` present), `/api/departments/:id/users` (200 incl.
    `Alex793x`, and 404 on unknown), `/api/blueprints` (array incl. `python-service`).
  - Pure `resolve_init_request`: valid (single + multiple users), unknown dept, unknown user, user
    from another department, empty users, bad service_kind, bad project name → all `Validation`.
  - `MockData::load` sanity.
- **keel-cli (13 pass + 1 ignored):**
  - `clap::try_parse_from`: full init parse, invalid service-kind rejected, missing required flag
    rejected, `--dry-run`/`--local` parsing, **`--dry-run` wins over `--local`**.
  - `resolve_request`: valid, multi-user order preserved, unknown dept/user, wrong-department user,
    bad project name.
  - `format_event` rendering.
  - `dry_run_smoke_with_fake_provider` — **`#[ignore]`d** run-level smoke (see dependency note).

Build (`cargo build -p keel-api -p keel-cli`) ✅. `cargo clippy` ✅ clean.

---

## Parallel-build dependency note

`--local` / `--dry-run` (and the API `/api/initialize`) exercise `keel_engine::Engine::initialize`,
which calls `keel_blueprint::render` and the `keel_github` providers — all built in parallel by
other agents. At the time of writing, `keel-engine::initialize`, `keel-blueprint::render`, and
`keel-github` (`GhCliProvider`/`LocalDirProvider`) were all implemented, so the ignored smoke test
**passes** when run with `cargo test -p keel-cli -- --ignored`, and the real `--dry-run`/`--local`
binary runs succeed. The smoke is kept `#[ignore]`d per spec so a transient `todo!()` in a
parallel crate can never break `cargo test -p keel-cli`. Everything **compiles** regardless.

`/api/initialize` is intentionally **not** unit-tested end-to-end (real-gh path is the
orchestrator's E2E, per SPEC §7).

---

## MemTrace

- `fleet_publish_intent` (repo `keel`, agent `fleet-api-rs`, branch `main`,
  assignment "Implement keel-api HTTP server + keel-cli E2E driver", touched
  `["keel_api::router","keel_cli::main"]`, intent `{"feature":{"surface":"new_module"}}`) — sent;
  no active conflicts, coordination advice "clear".
- `fleet_record_episode` — recorded at completion.
