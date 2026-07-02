# Area A — Rust: named services + add-service (SPEC §19.1–§19.4, §19.6)

Status: **done**. All gates green (`cargo fmt --check`, `cargo clippy --workspace --all-targets -D warnings`, `cargo test --workspace` — 161 tests, 2 live-network ignored).

## Naming contract (keel-core)
- `ServiceSelection.name: Option<String>` — additive (`serde(default)`); CLI form gains an optional
  third segment `type:lang:name`.
- `resolve_service_names` is the single chokepoint: explicit names win verbatim; unnamed entries keep
  the v4 ordinal defaults (`{tag}` / `{tag}-{n}`, counted among unnamed of that type only); any
  duplicate in the final set is a `Validation` error. `service_repo_names` / `service_dirs` delegate.
- `is_valid_service_name` + `SERVICE_NAME_PATTERN` (`^[a-z][a-z0-9-]{1,29}$`, no trailing hyphen).

## Provider capability (keel-github)
- `RepoProvider::read_file` / `push_files` — additive trait methods (default `Unsupported`).
- `GhCliProvider` (gh contents API / clone→commit→push), `LocalDirProvider` (`git show` / switch+
  commit+restore), `FakeProvider` (in-memory per-branch overlay trees + `pushed()` for assertions).

## Engine (keel-engine)
- `Engine::add_service(spec, provider, on_event) -> AddServiceOutcome` via `workflow/add_service.rs`.
  multi-repo → one new `{project}-{name}` repo (reuses multi.rs); monolith → read `keel.services.json`
  from `dev`, append the entry, render with the monolith ctx, one `push_files` commit to `dev`.
- Integration tests (`tests/add_service.rs`): multi new-repo naming, unnamed default, monolith
  one-commit-to-dev with stripped root files + updated manifest, compounding successive adds.

## API (keel-api)
- `POST /api/projects/:id/services` (`overview::add_project_service`) → `{ service, repo, materialized,
  events }`; validates type/lang/name, resolves the name against the merged (generated + overlay)
  service set, records to the `keel.additions.json` overlay store (`additions.rs`), `materialized:false`
  (catalog-only — see §19.4 note; real materialization is the engine/CLI path).
- `AdditionsStore` wired into `AppState`; `project_overview` merges the overlay into `project.services`
  so additions survive restarts and appear on the dashboard. Endpoint tests: 200 + merge, dup → 400,
  unnamed-default collision → 400, bad name/type → 400, unknown project → 404.

## Notes / follow-ups
- CLI `add-service` subcommand (SPEC §19.5, §19.6) not yet added — the endpoint + engine deliver the
  live dashboard flow the user asked for; the CLI is a deferred convenience.
- API `materialized:true` for real projects needs the catalog to persist the init-context
  (department/users/author/description); documented follow-up in SPEC §19.4.
