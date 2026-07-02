# Fleet-ApiCli-V3 — v3 API endpoints + CLI flags (SPEC §13)

**Owner:** Fleet-ApiCli-V3 · **Status:** ✅ done · **Branch:** `main`
**Exclusive subtree:** `crates/keel-api/`, `crates/keel-cli/` (nothing else touched).
No new deps. No prod unwraps. Legacy behavior byte-identical (tested).

---

## keel-api

### New endpoints

| Method · Path | Returns |
| --- | --- |
| `GET /api/users` | the 11 global v3 contributors, `keel_core::Person` serialized directly: `[{id,name,chapter,email,github_login}]` |
| `GET /api/service-catalog` | the 5 service types in design order with per-language availability: `[{id:"fe",tag:"FE",label:"Frontend",langs:[{id:"react",name:"React",available:true},…]},…]` |

- Language sets (design order): fe: react,vue,blazor · api: dotnet,python,node ·
  wk: dotnet,python,go · dp: python,dbt,spark · inf: terraform,bicep.
  Display names: React, Vue, Blazor, .NET, Python, Node.js, Go, dbt, Spark, Terraform, Bicep.
- `available` = `{blueprints_dir}/services/{tag}-{langid}` is a directory, computed **at request
  time** by the pure `scan_service_catalog(base_dir)` (exported from `keel_api`, testable against
  any base dir). Type ids/tags/labels come from `keel_core::ServiceType::all()/tag()/label()` —
  nothing hardcoded.

### `POST /api/initialize` — additive v3 body

- `InitializeBody` gains `#[serde(default)] layout: Option<String>` and
  `#[serde(default)] services: Vec<keel_core::ServiceSelection>` (wire shape
  `{"type":"api","lang":"python"}` from keel-core serde).
- `to_selection()` → fallible `try_to_selection()`: parses `layout` via `RepoLayout::from_str`
  (absent ⇒ `MultiRepo`), passes `services` through. Invalid layout ⇒ `KeelError::Validation`
  ⇒ HTTP 400.
- The handler now deserializes via `Json<serde_json::Value>` → `serde_json::from_value`, so body
  shape errors (e.g. unknown service type `"gpu"`) also return the uniform 400 `{"error": …}`
  instead of axum's default 422 rejection.
- Legacy v2 bodies (no new fields) produce the exact v2 `Selection` (asserted by equality in
  `legacy_initialize_body_maps_to_the_exact_v2_selection`).

### Tests (14 green, `cargo test -p keel-api`)

- `/api/users`: 11 people, `Alex793x` present, all five fields per person.
- `/api/service-catalog`: 5 types in design order (`fe,api,wk,dp,inf` / `FE…INF`), full lang
  sets + display names; availability flips via oneshot against a temp blueprints dir with/without
  `services/api-python`; pure-scan test incl. "a plain file is not a blueprint".
- Initialize body: legacy ⇒ exact v2 selection; v3 layout+services deserialize; 400 on bad layout
  (`"solo"`), 400 on bad service type (`"gpu"`); existing 400-unknown-department test unchanged.

## keel-cli

### New flags (both optional; legacy invocations unchanged)

- `--layout <multi-repo|monolith>` — default `multi-repo`, clap `value_parser` restricted to the
  two tokens.
- `--services <type:lang,…>` — comma list (e.g. `api:python,fe:react`), each entry parsed via
  `keel_core::ServiceSelection::parse` at resolve time with a clear anyhow error
  (`invalid --services entry "gpu:python": unknown service type: "gpu" (expected fe|api|wk|dp|inf)`).
- New pure helper `parse_v3_flags(&InitArgs) -> anyhow::Result<(RepoLayout, Vec<ServiceSelection>)>`;
  `resolve_request` wires both into the shared `Selection` → `MockCatalog::resolve`.
- Crate docstring/usage updated with the v3 flags.

### Tests (13 green + 1 pre-existing ignored, `cargo test -p keel-cli`)

- Parses both flags; defaults (`multi-repo`, empty services) assert the legacy path.
- `--layout solo` rejected by clap; `--services gpu:python` errors mentioning `fe|api|wk|dp|inf`
  (both from `parse_v3_flags` and through `resolve_request`); malformed pair explains `type:lang`.
- `resolve_request` maps v3 flags into `InitRequest` (layout `Monolith`, services len 2,
  blueprint names `api-python`/`fe-react`); legacy invocation resolves to the v2 request shape.

## Notes for other areas

- **Hub**: wire shapes above are final; see also “exact wire shapes” in the fleet episode.
- **Engine**: no dependence on v3 engine behavior in these tests — endpoint tests fail before the
  engine runs (validation-level), selection/body assertions are pure.
- Gates at hand-off (after the engine/blueprint v3 area landed): `cargo fmt --all` ✓ ·
  `cargo clippy --workspace --all-targets -- -D warnings` ✓ ·
  `cargo test -p keel-api -p keel-cli` ✓ · `cargo test --workspace` ✓ (all suites 0 failed).
