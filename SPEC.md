# Keel — Master Specification (v2: Rust engine + TanStack Start hub)

> **Keel** is the project-initialization layer of the **Ramboll Developer Platform (RDP)**.
> A self-service **Hub** where a Ramboll engineer signs in, **selects a department and the users**
> who will own the project, picks the Python blueprint, and — in minutes — gets a **real GitHub
> repository** that is standards-compliant and green from its first commit.
>
> Vision source: `keel_whitepaper.pdf` ("Laying the Keel", June 2026). This SPEC is the **binding
> contract** for the v2 build and the integration boundaries between work areas. `Tracker.md`
> tracks execution.

> **v2 supersedes v1.** v1 (Python FastAPI hub + Python engine) is removed. The **engine is now
> Rust** (a Cargo workspace — this matches the whitepaper's actual proposal, §4.1) and the **hub is
> TanStack Start** (React/TS). Two v1 deliverables are **retained because they are correct,
> tested, and language-agnostic**: the Python golden-path **blueprint** (`blueprints/services/api-python/`)
> and the **reusable GitHub Actions** (`.github/`). Both are refined here, not rebuilt.

---

## 1. Non-negotiable goals (from the user)

1. **Engine in Rust**, with a **senior, professional codebase structure** (multi-crate Cargo
   workspace, clear separation of concerns, dependency-inverted I/O).
2. **Hub UI in TanStack Start**; **frontend tests in Vitest**.
3. **TDD + property testing everywhere** — every behaviour is pinned by a test so no change can
   silently regress. Rust: `cargo test` + `proptest`. Frontend: Vitest + `fast-check`.
4. **E2E**: sign in → **select a department and users** (mocked) → submit → a **new GitHub
   repository is created** (via the user's `gh`) that follows the blueprint requirements
   (Python golden path, README + architecture.md, three AI agent skills, three GitHub Actions
   referencing reusable workflows, `main`/`dev`/`staging` + `feature/`·`bug/`·`hotfix/`).
5. Use **`gh` for repo creation** (the user's authenticated CLI; account `Alex793x`, scopes
   include `repo` + `workflow`). Departments and users are **mocked**.
6. Same methodology: **MemTrace + fleet** for parallel implementation and visibility.

---

## 2. Architecture (v2)

```
  EXPERIENCE PLANE                ORCHESTRATION PLANE (Rust)                 INTEGRATION PLANE
  ┌────────────────────┐   ┌──────────────────────────────────────┐   ┌──────────────────────┐
  │  hub/ (TanStack     │   │  keel-api  (axum HTTP)                │   │  gh CLI → GitHub      │
  │  Start, React/TS)   │   │   ├─ keel-engine (8-step workflow)    │   │  • create repo        │
  │  • login (mock)     │──▶│   │    ├─ keel-blueprint (minijinja)  │──▶│  • push main          │
  │  • select dept+users│   │   │    └─ keel-github (RepoProvider)  │   │  • dev/staging        │
  │  • pick blueprint   │◀──│   └─ keel-core (domain types+traits)  │   │  • CODEOWNERS         │
  │  • live progress    │   │  keel-cli (headless E2E driver)       │   │  (Python repo)        │
  └────────────────────┘   └──────────────────────────────────────┘   └──────────────────────┘
```

The **8-step idempotent workflow** (whitepaper §6), executed by `keel-engine`:
`signin → form → render → create_repo → commit → branches → seed_ci → register`. Each step is
idempotent (re-running never duplicates), reversible-ish, and emits a `ProgressEvent`.

---

## 3. Rust workspace layout & **crate contracts** (frozen in Phase 0 — do NOT change public signatures)

```
Cargo.toml                      # [workspace] — orchestrator owns this
crates/
├── keel-core/      # domain types + traits + errors. Depends on: (serde, thiserror) only.
├── keel-blueprint/ # manifest load/validate + minijinja render. Depends on: keel-core (+minijinja, serde_yaml, serde)
├── keel-github/    # RepoProvider impls: GhCliProvider (subprocess) + FakeProvider. Depends on: keel-core
├── keel-engine/    # the 8-step workflow orchestrator. Depends on: keel-core, keel-blueprint, keel-github
├── keel-api/       # axum HTTP server + mocked dept/users data. Depends on: keel-engine (+axum, tokio, tower-http)
└── keel-cli/       # headless initialize (E2E driver). Depends on: keel-engine, keel-github
```

### 3.1 `keel-core` — the contract crate (Phase 0 writes this fully)

Also hosts `keel_core::catalog` — the **single source of truth** for the mocked department/user
catalog (`MockCatalog`, `DepartmentRecord`) and the pure selection→request resolver
(`Selection`, `MockCatalog::resolve`). Both `keel-api` and `keel-cli` build a `Selection` and call
`resolve`, so the HTTP and CLI paths never drift.

```rust
// Domain
pub struct Department { pub id: String, pub name: String, pub team_slug: String }
pub struct User { pub id: String, pub name: String, pub email: String, pub github_login: String }
pub enum ServiceKind { RestApi, Worker }
pub struct InitRequest {            // what the form produces
    pub project_name: String,       // validated ^[a-z][a-z0-9-]{2,40}$
    pub blueprint: String,          // e.g. "api-python"
    pub department: Department,
    pub users: Vec<User>,           // selected owners → CODEOWNERS
    pub service_kind: ServiceKind,
    pub description: String,
    pub author: String,
}
pub struct RenderedFile { pub path: String, pub contents: Vec<u8> }   // bytes: templates may be binary-safe
pub struct ProgressEvent { pub step: u8, pub key: String, pub title: String, pub status: Status, pub detail: String }
pub enum Status { Started, Done, Skipped, Error }
pub struct RepoCoordinates { pub owner: String, pub name: String, pub html_url: String, pub default_branch: String, pub branches: Vec<String> }
pub struct InitOutcome { pub project: String, pub repo: RepoCoordinates, pub docs_path: String,
                         pub blueprint_version: String, pub catalog_id: String, pub events: Vec<ProgressEvent> }

// Errors
pub enum KeelError { Validation(String), Render(String), Github(String), Io(String), Conflict(String) }
pub type Result<T> = std::result::Result<T, KeelError>;

// I/O abstraction (dependency inversion → engine is unit-testable with a fake)
pub trait RepoProvider {
    fn repo_exists(&self, owner: &str, name: &str) -> Result<bool>;
    fn create_repo(&self, spec: &RepoSpec) -> Result<RepoCoordinates>;      // create + push initial commit on `main`
    fn ensure_branches(&self, repo: &RepoCoordinates, branches: &[String]) -> Result<()>;
    fn write_protection(&self, repo: &RepoCoordinates, policy: &ProtectionPolicy) -> Result<()>;
}
pub struct RepoSpec { pub owner: String, pub name: String, pub description: String, pub private: bool,
                      pub default_branch: String, pub files: Vec<RenderedFile>, pub commit_message: String }
pub struct ProtectionPolicy { pub branch: String, pub required_reviews: u8, pub require_codeowners: bool, pub required_checks: Vec<String> }
```
All structs derive `Debug, Clone, serde::Serialize, serde::Deserialize` (where sensible). `Status`
serializes lowercase. Keep this crate dependency-light.

### 3.2 `keel-blueprint` — frozen public API
```rust
pub struct Manifest { /* apiVersion, kind, metadata, parameters, template, repository, postActions */ }
pub fn load_manifest(blueprint_dir: &Path) -> keel_core::Result<Manifest>;
pub fn validate_request(m: &Manifest, req: &InitRequest) -> keel_core::Result<()>;
pub fn derive_context(req: &InitRequest) -> serde_json::Map<String, serde_json::Value>; // package_name, year, branch_conventions, department, users…
pub fn render(m: &Manifest, blueprint_dir: &Path, req: &InitRequest) -> keel_core::Result<Vec<RenderedFile>>;
```
**Renderer rules (identical contract to v1, MiniJinja edition):** path segments interpolate `{{ }}`
always; file **contents** render through MiniJinja **only if the filename ends in `.j2`** (then the
suffix is stripped); every other file is copied **verbatim** (so GitHub `${{ }}` is preserved).
Honor `template.conditions`. Inject `package_name` (= project_name `-`→`_`, keyword-safe),
`year`, `branch_conventions` (`feature/`,`bug/`,`hotfix/`), `department`, `users`.

### 3.3 `keel-github` — frozen public API
```rust
pub struct OctocrabProvider { /* typed octocrab SDK + a Tokio runtime */ }
impl OctocrabProvider { pub fn new(token: String) -> Result<Self>; pub fn from_gh() -> Result<Self> }
impl keel_core::RepoProvider for OctocrabProvider { /* … */ }

pub struct GhCliProvider { pub owner: String }        // shells out to `gh` + `git`
impl GhCliProvider { pub fn new(owner: String) -> Self }
impl keel_core::RepoProvider for GhCliProvider { /* … */ }

pub struct LocalDirProvider { /* writes a real local git repo, no network */ }
pub struct FakeProvider { /* in-memory, for tests: records created repos, branches, files */ }
impl FakeProvider { pub fn new() -> Self ; pub fn created(&self) -> Vec<RepoCoordinates> }
impl keel_core::RepoProvider for FakeProvider { /* … */ }
```
**`OctocrabProvider` (the recommended/production provider, whitepaper Appendix A)** — typed
`octocrab` SDK. `create_repo`: `POST /user/repos` (`auto_init:true` so the repo is not empty, which
the Git Data API requires) → blobs → tree → **root commit (no parents)** → force-update the default
ref, yielding exactly one clean commit. `ensure_branches`: create `dev`/`staging` refs from the
default tip. `write_protection`: best-effort `PUT …/protection`. octocrab is async and the trait is
sync, so the provider bridges via an owned Tokio runtime + `block_on`. Auth: a user access token —
in the MVP `from_gh()` reads it from `gh auth token` (selected by the CLI's `--octocrab` flag).

**`GhCliProvider`** (the gh-CLI alternative) `create_repo`: render→temp dir→`git init -b main`→commit→`gh repo create
<owner>/<name> --private --source . --remote origin --push`; idempotent (if `gh repo view`
succeeds, skip). `ensure_branches`: create+push `dev`,`staging`. `write_protection`: best-effort
via `gh api` PUT branch protection (tolerate failure on personal repos; never aborts). The
**durable record** of protection intent is a `branch-protection.json` that the **engine** always
commits into the repo (`keel-engine` adds it to the rendered file set), independent of whether the
host can enforce protection.

### 3.4 `keel-engine` — frozen public API
```rust
pub struct Engine { /* holds blueprints_dir, catalog path */ }
impl Engine {
  pub fn new(blueprints_dir: PathBuf, owner: String) -> Self;  // owner = GitHub account/org for new repos
  pub fn initialize(&self, req: &InitRequest, provider: &dyn RepoProvider,
                    on_event: &mut dyn FnMut(&ProgressEvent)) -> keel_core::Result<InitOutcome>;
  pub fn list_projects(&self) -> keel_core::Result<Vec<InitOutcome>>;   // from catalog (JSON file)
}
```
Implements the 8 ordered idempotent steps; catalog/audit persisted as JSON (no DB infra in MVP).

### 3.5 `keel-api` — HTTP contract (the hub consumes this)
axum server, default `:8787`, permissive CORS for the hub dev origin. Split into cohesive modules —
`state` (`AppState` + config), `dto` (wire shapes; `InitializeBody::to_selection`), `routes` (router +
thin handlers + `scan_blueprints`) — with the catalog/resolution in `keel_core::catalog`.
| Method · Path | Returns |
| --- | --- |
| `GET /api/health` | `{ "status": "ok" }` |
| `GET /api/departments` | `[{id,name,team_slug}]` (mocked, Ramboll divisions) |
| `GET /api/departments/:id/users` | `[{id,name,email,github_login}]` (mocked) |
| `GET /api/blueprints` | `[{name,title,description,version,parameters}]` |
| `POST /api/initialize` | body `{project_name,blueprint,department_id,user_ids[],service_kind,description,author}` → `{events:[ProgressEvent], outcome:InitOutcome}` |
| `GET /api/projects` | `[InitOutcome]` |

### 3.6 `keel-cli` — headless E2E driver
`keel-cli init --project <name> --department <id> --users <id,id> --service-kind rest-api
--description "…" --author "…" [--owner Alex793x] [--dry-run]`. Uses `GhCliProvider` (or
`FakeProvider` with `--dry-run`). This is the deterministic E2E entry point the orchestrator runs.

---

## 4. The Hub (`hub/`) — TanStack Start

- **Stack:** TanStack Start (`@tanstack/react-start` + `@tanstack/react-router`), React 19, TS,
  Vite, **Vitest** + **@testing-library/react** + **fast-check** (property tests), Ramboll-branded
  CSS (tokens in §8).
- **Flow / routes:** `/login` (mock — any `@ramboll.com` email), `/` catalog, `/new` the wizard:
  **(1) select department** (from `GET /api/departments`), **(2) select users** (multi-select from
  `GET /api/departments/:id/users`), **(3) project details** (name, service kind, description),
  **(4) submit** → `POST /api/initialize` → progress view with the 8 steps + the repo URL;
  `/projects` catalog.
- **API client:** thin typed fetch wrapper to the Rust API; base URL from `VITE_KEEL_API_URL`
  (default `http://localhost:8787`).
- **TDD:** pure logic (validation, the dept→users→details state machine, payload builder, API
  client) is extracted into testable modules and covered by Vitest + fast-check property tests
  (e.g. "a submit payload always contains ≥1 user and a valid project name", "selecting a
  department resets users"). Components tested with Testing Library.

---

## 5. The E2E (the headline acceptance test)

**Definition:** select department + users (mocked) → trigger a new repo following the requirements.

Two complementary, runnable layers (both required):
1. **Real-repo E2E (engine→gh):** `keel-cli init …` (or `POST /api/initialize`) creates a **real**
   private GitHub repo under `Alex793x`, named `keel-e2e-<project>`, with the full Python blueprint
   tree, `main`/`dev`/`staging`, and CODEOWNERS derived from the selected department + users. The
   orchestrator verifies with `gh repo view` + `gh api .../branches` and then **deletes** the test
   repo (clean up; report the URL first). Idempotent: re-run does not error.
2. **UI E2E (selection logic):** a Vitest integration test mounts the wizard, selects a department,
   selects users, fills details, submits, and asserts the API client is called with the exact
   payload (fetch mocked). Proves the UI produces a correct request.

Mocked departments (Ramboll divisions) + a few users each are the **single source** shared by
`keel-api` (Rust) and the hub fixtures.

---

## 6. Area ownership (no two agents touch the same subtree)

Phase 0 (orchestrator) writes: workspace `Cargo.toml`, **`keel-core` (full)**, compiling **stubs**
for every other crate (frozen public APIs, `todo!()` bodies), the hub skeleton, SPEC, Tracker.
Then the fleet fills bodies + tests in parallel:

| Area | Owner | Exclusive subtree |
| --- | --- | --- |
| Blueprint engine | Fleet-Blueprint-RS | `crates/keel-blueprint/` |
| GitHub provider | Fleet-Github-RS | `crates/keel-github/` |
| Workflow engine | Fleet-Engine-RS | `crates/keel-engine/` |
| HTTP API + CLI | Fleet-Api-RS | `crates/keel-api/`, `crates/keel-cli/` |
| Hub UI | Fleet-Hub | `hub/` |
| Python blueprint refine | Fleet-Blueprint-PY | `blueprints/services/api-python/` |
| Reusable CI + Keel CI | Fleet-CI | `.github/` |
| Docs | Fleet-Docs | `README.md`, `architecture.md`, `docs/` |

**Parallel-safety rule:** agents may add private items, modules, and tests, but **must not change
the frozen public signatures** in §3 (other crates compile against them). Report into
`tracker/<area>.md` only; never edit `Tracker.md` or another area's subtree.

---

## 7. TDD + property-testing requirements (every Rust crate, every frontend module)

- **Red→green:** add/keep tests with each behaviour; `cargo test` (workspace) and `vitest` must be
  green at all times the orchestrator checks.
- **Property tests (`proptest`)** at minimum: `keel-blueprint` — package_name derivation is a valid
  Rust/Python identifier, idempotent, hyphen-free; renderer keeps verbatim files byte-identical
  (incl. `${{ }}`), strips only `.j2`, interpolates paths; `validate_request` rejects bad
  name/enum. `keel-engine` — idempotency: initialize twice with `FakeProvider` ⇒ one repo, no dup
  catalog row; all 8 events emitted in order. `keel-github` — `FakeProvider` invariants.
- **Frontend (`fast-check`)**: payload builder + state machine invariants (see §4).

---

## 8. Brand tokens (Hub) — sampled from `keel_whitepaper.pdf`. Tagline: "Bright ideas. Sustainable change."
```
--rb-navy:#0B2947  --rb-navy-ink:#122A43  --rb-blue:#155FB0  --rb-cyan:#1AA7C8
--rb-amber:#E0A33E  --rb-panel:#EAF2FA  --rb-panel-cy:#EAF7F9  --rb-amber-tint:#FBF1DD
--rb-bg:#F4F8FC  --rb-border:#B4C1C8  --rb-white:#FFFFFF
font sans: "Helvetica Neue", Helvetica, Arial, sans-serif ; mono: ui-monospace, "SF Mono", Menlo, monospace
```

---

## 9. MemTrace fleet protocol (every agent)

1. MemTrace MCP first for code discovery (over grep).
2. START: `ToolSearch select:mcp__memtrace__fleet_publish_intent,mcp__memtrace__fleet_record_episode`,
   then `fleet_publish_intent` repo_id `"keel"`, a unique `agent_id`, branch `"main"`, an
   `assignment` string, `touched` symbol ids, intent `{"feature":{"surface":"new_module"}}`
   (the `surface` field is required — confirmed in v1; values like `new_module` work).
3. END: `fleet_record_episode` summarizing. Non-blocking: on error, note in tracker + continue.

---

## 10. Definition of Done (orchestrator verifies)

- [ ] `cargo build` and `cargo test` green across the workspace (incl. all proptests).
- [ ] `cd hub && npm test` (Vitest) green, incl. fast-check property tests; `npm run build` succeeds.
- [ ] `keel-cli init …` with a mocked department + users creates a **real** GitHub repo that
      contains the full Python blueprint tree, `main`/`dev`/`staging`, and CODEOWNERS reflecting the
      selection. Verified via `gh repo view`/`gh api`, then cleaned up.
- [ ] Generated repo passes the green-from-birth bar (its own `pytest`/ruff/black/mypy) — verified
      by cloning the created repo (or rendering locally) and running the gate.
- [ ] `keel-api` serves the §3.5 endpoints; the hub wizard drives department→users→submit.
- [ ] `Tracker.md` shows all areas ✅; MemTrace episodes recorded for every agent.

---

# v3 — Multi-service projects: monolith / multi-repo + smart selective CI

> v3 makes the redesigned wizard REAL: a project is a set of **service components**
> (`fe|api|wk|dp|inf` × language), created either as **one repo per service** (multi-repo) or as a
> **single monolith repo** with a **change-aware CI** that rebuilds only affected services.
> Everything below is the binding contract for the v3 fleet. Legacy single-service behavior
> (`blueprint` + `service_kind`) is preserved exactly when `services` is empty.

## 11. Core contract (keel-core — implemented by the orchestrator BEFORE fleet dispatch)

```rust
#[serde(rename_all = "kebab-case")] pub enum RepoLayout { MultiRepo, Monolith }   // Default: MultiRepo
#[serde(rename_all = "lowercase")]  pub enum ServiceType { Fe, Api, Wk, Dp, Inf } // tag(): "fe".."inf"
pub struct ServiceSelection { pub service_type: ServiceType, pub language: String } // language slug: react|vue|blazor|dotnet|python|node|go|dbt|spark|terraform|bicep
impl ServiceSelection { pub fn parse("api:python") -> Result<Self> }               // CLI form

// InitRequest — ADDITIVE (serde(default)); services.is_empty() ⇒ legacy path, exactly v2 behavior:
pub layout: RepoLayout,
pub services: Vec<ServiceSelection>,

// InitOutcome — ADDITIVE: all created repos (legacy fills vec![repo.clone()]):
#[serde(default)] pub repos: Vec<RepoCoordinates>,

// Naming (property-tested): tag appearing once ⇒ no ordinal; k>1 ⇒ 1-based ordinals, order preserved.
pub fn service_repo_names(slug, &[ServiceSelection]) -> Vec<String>  // "{slug}-{tag}" | "{slug}-{tag}-{n}"
pub fn service_dirs(&[ServiceSelection]) -> Vec<String>              // "{tag}" | "{tag}-{n}"  (monolith services/ dirs)

// keel.services.json (generated by the ENGINE via serde — never a template):
pub struct ServiceEntry    { pub dir, pub service_type, pub language, pub name, #[serde(default)] pub depends_on: Vec<String> }
pub struct ServicesManifest{ pub version: 1, pub project, pub shared_paths: Vec<String>, pub services: Vec<ServiceEntry> }
// ServicesManifest::new(project, &services) — shared_paths default: [".github/", "keel.services.json", "libs/"]
```

**Catalog v2 (`fixtures/mock-data.json`)** — matches the design's data exactly:
- `departments`: the 7 GBAs — energy, water, transport, buildings, environment-health,
  management-consulting, architecture-landscape (`id`,`name`,`team_slug`; no per-dept users).
- `people` (NEW, global contributors): the 10 design PEOPLE (chapter; email `first.last@ramboll.com`;
  mock github logins) **+ u-alex / Alex Holmberg / Alex793x** (the real E2E account).
- `MockCatalog` gains `people: Vec<Person>` (`Person` = User fields + `chapter`); `resolve()` resolves
  `user_ids` against **people** (global). `platform-engineering` department is REMOVED — tests move to
  `energy` + `u-alex` (valid: users are global now).

## 12. Engine contract (keel-engine + keel-blueprint)

Blueprint resolution: service `{type,lang}` → dir `blueprints/services/{tag}-{lang}/` (normal keel/v2
blueprint). Missing dir ⇒ `KeelError::Validation` listing available combos.

**Multi-repo** (`layout=multi-repo`, services non-empty): for service i → render its blueprint with
per-service context → create repo `service_repo_names()[i]` (branches+protection per repo, same as
v2). Steps stay the 8 canonical events; steps 4–6 aggregate (detail lists every repo). Outcome:
`repos` = all, `repo` = first. Idempotent per repo.

**Monolith**: ONE repo `{slug}`. Compose: (1) render `blueprints/monolith-root/` at root; (2) render
each service blueprint, DROP paths starting `.github/`, `.claude/` and files `LICENSE`, `SECURITY.md`,
`CODEOWNERS`, `CONTRIBUTING.md`, then prefix `services/{dir}/`; (3) engine serializes
`keel.services.json` from `ServicesManifest` (structurally guaranteed). Root blueprint owns CI,
CODEOWNERS, skills, docs.

**Template context additions** (keel-blueprint `derive_context`): `layout` ("monolith"|"multi-repo");
for service renders `service: {tag, dir, lang, label, repo_name}`; for the root render
`services: [{tag, dir, lang, label, repo_name}, …]`. Existing context vars unchanged.

## 13. API + CLI contract

- `GET /api/users` → people `[{id,name,email,github_login,chapter}]`.
- `GET /api/service-catalog` → the 5 types with per-lang availability (dir existence under
  `blueprints/services/`): `[{id:"fe",tag:"FE",label:"Frontend",langs:[{id:"react",name:"React",available:true},…]},…]`.
  Display names: React, Vue, Blazor, .NET, Python, Node.js, Go, dbt, Spark, Terraform, Bicep.
- `POST /api/initialize` v2 body adds optional `layout` + `services:[{type:"api",lang:"python"}]`;
  legacy bodies (no `services`) behave exactly as v2. Response: `{events, outcome}` (outcome now
  carries `repos`).
- CLI: `--layout monolith|multi-repo`, `--services api:python,fe:react` (comma list). Legacy flags
  unchanged and default to the v2 path.

## 14. Early service blueprints (`blueprints/services/`)

8 blueprints: `fe-react`, `api-python`, `api-node`, `api-dotnet`, `wk-python`, `wk-go`, `dp-python`,
`inf-terraform`. Each: keel/v2 manifest (+ `service: {type, language}` metadata), template with a
small WORKING module + smoke/property tests, README, and (for standalone/multi-repo use) its own
`.github/workflows/{build,test,validate}.yml` where the toolchain fits the reusable workflows
(python) or self-contained lang CI otherwise. **Local green-from-birth bar** applies to
fe-react, api-node (node ✓) and api-python, wk-python, dp-python (uv ✓); dotnet/go/terraform are
authored complete + validated in CI (toolchains absent locally — documented). The 6 remaining combos
(vue, blazor, wk-dotnet, dp-dbt, dp-spark, inf-bicep) stay unavailable ⇒ hub shows them dimmed/SOON.

## 15. Smart monolith CI (`blueprints/monolith-root/`) — the novelty bar

- `.github/scripts/detect_services.py` — stdlib-only, PURE resolver: `(manifest, changed_paths) →
  affected services`. Rules (prefix semantics, in order): (1) unreadable/empty diff ⇒ ALL (safe
  fallback); (2) any path under a `shared_paths` prefix ⇒ ALL; (3) `services/{dir}/…` ⇒ that service;
  (4) `depends_on` transitive closure added; (5) anything else ⇒ no services (root gate still runs).
- `tests/test_detect_services.py` — **hypothesis properties**: monotonicity (more changes ⇒ superset),
  shared⇒all, isolation (only svc-X paths ⇒ closure(X)), closure idempotence+transitivity,
  determinism, total fallback. The generated monolith tests its OWN pipeline logic — green from birth.
- `.github/workflows/ci.yml`: `detect` (fetch-depth 0; PR base sha / push `before`; fallback ALL) →
  `gate` (always: root pytest incl. resolver properties + manifest validation) → `services` matrix
  `fromJSON(detect.outputs.services)`, per-lang steps (`working-directory: services/${{ matrix.dir }}`):
  python ⇒ pip+pytest+ruff+black+mypy · node ⇒ npm ci+test+build · go ⇒ vet+test+build ·
  dotnet ⇒ restore+test · terraform ⇒ fmt-check+validate. No affected services ⇒ matrix job skips.
- Root also ships README (service index), CODEOWNERS (dept+users), `.claude/skills/` (once),
  root `pyproject.toml` (pytest+hypothesis for the gate), docs.

## 16. Hub wiring (design pixels stay; data goes live)

- `api.ts`: `getUsers`, `getServiceCatalog`, v2 `initialize`. Wizard chips render IDENTICALLY but
  from live data: GBA chips ← `/api/departments` (7), contributor chips ← `/api/users` (11),
  type cards/langs ← `/api/service-catalog` (unavailable langs dimmed + SOON chip, the design's
  established pattern). NEW layout selector (Monolith | Multi-repo pills, mono label, same chip
  vocabulary) — additive section in card 03.
- Provisioning overlay: SAME visual rows, now driven by the REAL 8 ProgressEvents:
  signin→AUTH·ENTRA ID, form→VALIDATE·CATALOG, render→GOLDEN PATH, create_repo→GITHUB,
  commit→GITHUB, branches→GOVERNANCE, seed_ci→ACTIONS, register→CATALOG. done/active/pending icons
  per event status; errors render the message in the overlay (design error tone).
- Created screen: repo chips = REAL `outcome.repos` (owner/name, linking to html_url).
- Tests: fetch-mocked wizard integration (happy + failure), fast-check on the v2 payload builder
  (services non-empty ⇔ submittable; layout always valid).

## 17. v3 Definition of Done

- [ ] Workspace + hub gates green (fmt/clippy/tests incl. new proptests; Vitest incl. fast-check).
- [ ] Real gh E2E #1: multi-repo project (api:python + fe:react) ⇒ 2 repos, correct names, CODEOWNERS,
      each green-from-birth for locally-verifiable stacks.
- [ ] Real gh E2E #2: monolith (api:python + fe:react + wk:python) ⇒ 1 repo with `services/{api,fe,wk}/`,
      `keel.services.json`, smart ci.yml, resolver tests passing INSIDE the generated repo.
- [ ] Resolver property suite proven: root-only change ⇒ no services; svc change ⇒ exactly closure;
      shared change ⇒ all (demonstrated with real `git diff` output on the generated monolith).
- [ ] Hub wizard drives the whole flow against the live API.

---

## 18. v4 — Project dashboard (`/projects/:id`) — contract + design brief

**Goal.** Clicking a project opens a *breathtaking, applefied* mission-control page: everything a
team member needs to onboard and manage — branches (the centerpiece), last commits, running CI and
status, who initialized it, the crew, and day-one onboarding. **Out of scope:** observability,
deployment state.

### 18.1 Wire contract — `GET /api/projects/:id/overview` → `200 ProjectOverviewDto` | `404 {error}`

All timestamps are **unix epoch seconds (i64)** — no new Rust deps; the hub formats relative time
with a pure, tested `timeAgo(epochS, nowS)`.

```jsonc
{
  "project": { "id", "name", "description", "gba", "status",          // Healthy|Warning|Critical|Experimental
               "layout",                                                // "multi-repo"|"monolith"
               "services": [{ "dir", "type", "lang", "name" }],
               "initialized_by": { "id","name","github_login","chapter" } | null,
               "initialized_at": 0 | null,
               "blueprint", "blueprint_version",
               "repos": [{ "name", "html_url", "default_branch" }] },
  "team":     [{ "user": { "id","name","github_login","chapter" },
                 "role": "owner"|"contributor",
                 "active_branch": "feature/…" | null, "last_active": 0 }],
  "branches": [{ "name", "kind": "main"|"staging"|"dev"|"feature"|"bug"|"hotfix",
                 "ahead": 0, "behind": 0,                              // vs dev (rails: vs main)
                 "author": { "name","github_login" } | null,
                 "tip": { "sha", "message", "at" },
                 "ci": "running"|"passed"|"failed"|"none",
                 "pr": { "number","title","target","reviews_done","reviews_required" } | null,
                 "commits": [{ "sha","message","author_login","at" }] }],   // ≤5, desc by at
  "runs":     [{ "id", "workflow": "build"|"test"|"validate"|"gate",
                 "branch", "status": "running"|"queued"|"passed"|"failed",
                 "started_at": 0, "duration_s": 0 | null,               // null ⇔ running|queued
                 "triggered_by": "github_login", "trigger_sha": "" }],
  "commits":  [{ "sha", "message", "author": { "name","github_login" }, "branch", "at" }] // ≤20 desc
}
```

### 18.2 Server-side generator (keel-api) — deterministic mock, real facts merged

Pure `fn overview(id, catalog_row: Option<&InitOutcome>, people, now_s) -> ProjectOverviewDto`:
- Seed = FNV-1a(id) driving a tiny xorshift PRNG (no `rand` dep). **Same id ⇒ identical structure**;
  timestamps are `now_s − stable_offset` so the page always feels alive.
- Knows the **6 seeded design projects** (ids/rows byte-equal to `hub/src/lib/hub-data.ts` PROJECTS)
  *and* real catalog projects (matched by project name or catalog id): real rows contribute
  `repos`, `blueprint_version`, `layout`, `services`; the rest is generated. `initialized_by` for
  real rows is honestly best-effort (catalog does not persist the author) — pick deterministically
  from `people` and document it.
- **Invariants (proptest-pinned):** exactly one each of main/staging/dev; 1..=5 working branches,
  every name matching `^(feature|bug|hotfix)/[a-z0-9]+(-[a-z0-9]+)*$`; working `ahead ≥ 1`; rails
  `ahead = 0`; per-branch commits + flat feed sorted desc, all `at ≤ now_s`; `duration_s = null ⇔
  status ∈ {running, queued}`; each branch's `ci` equals the status of its latest run (`none` if no
  runs); every `author`/`triggered_by` drawn from `people`; 404 for unknown ids.

### 18.3 The page — layout + the novel branch exploration ("the Flow")

Design language: existing dark tokens (`hub/src/design/tokens.ts`), Nunito + JetBrains Mono, glass
cards `#0A1B33` on `#061021`, the design's exact motion (`fadeUp`, `popIn`, `edgeDraw`,
`cubic-bezier(0.2,0.7,0.2,1)`, 70ms stagger). Applefied = generous whitespace, one focal point,
depth from layered shadows, no chrome.

```
← Projects                                                       [status chip]
RMB-EN-042 (mono, cyan, letterspaced)
District Heating Optimizer (38px/800)                 [Open repo] [Docs] [⧉ clone]
description · GBA chip · layout chip · service chips
Laid down by ⬤ Kristoffer Pedersen · 12 May 2026 · from api-python v0.3.0

┌─ THE FLOW — full-width glass panel (the centerpiece) ──────────────────────┐
│  main    ━━━━━━━━━━━━━━━━━━━━━━━━━━━ 🛡                                    │
│  staging ━━━━━━━━━━━━━━━━━━━━━━━━━━━                                       │
│  dev     ━━━━━┳━━━━━━━┳━━━━━━━━━━━━━                                       │
│     feature/… ┗●──●──●⟳ ⬤MK  +3        (tributaries fork from dev; commit │
│     bug/…      ┗●──●✓ ⬤JJ +1 PR#12      ticks; CI pulse at tip; avatar)    │
└────────────────────────────────────────────────────────────────────────────┘
[ Pipelines (runs, running first, live) ][ Activity (day-grouped commits) ][ sticky: Crew · Day one ]
```

**The Flow** (`BranchFlow`) mirrors the governance Keel itself enforces — that's why it "just makes
sense": three permanent **rails** (main brightest + shield, staging, dev) and working branches as
**tributaries** forking off dev with curved connectors (dashed return curve when a PR is open).
Per tributary: kind-colored dot (feature `#66C1F3` · bug `#FFE682` · hotfix `#FF8855`), mono name,
author avatar chip, ≤5 commit ticks (hover → tooltip: sha · message · age), CI pulse at the tip
(running = pulsing ring, passed = `#ADD095` check, failed = `#FF8855` ✗), `+ahead −behind` counters.
**Interaction:** hover lifts a lane and dims the rest (KB-diagram pattern); **click enters focus
mode** — the lane expands inline into a detail strip (commit list, PR + reviews, latest run per
workflow, "Open PR →") while others compress; Esc/click-away restores; ArrowUp/Down move focus.
Entrance: rails `edgeDraw`, tributaries `popIn` staggered.

**Pipelines** — runs with running-first ordering, pulsing dot + ticking elapsed for running,
duration for finished, workflow name, branch chip, trigger avatar. **Activity** — commits grouped
Today/Yesterday/date; conventional-commit type badge; sha in mono, click-to-copy. **Crew** — owners
first (OWNER tag), avatar/name/chapter, "on `feature/…`" active branch, last-active. **Day one**
(onboarding) — copyable `git clone` per repo, docs link, the 3 embedded skills as chips, branch-rule
reminder (`feature|bug|hotfix/<ticket>-<slug>`), CODEOWNERS summary.

### 18.4 Area ownership (fleet)

| Area | Exclusive files |
| --- | --- |
| **A — overview API** | `crates/keel-api/src/overview.rs` (new) + minimal wiring lines in `routes.rs`/`lib.rs` + `tracker/overview-api.md` |
| **B — dashboard** | `hub/src/routes/projects.$projectId.tsx`, `hub/src/components/project/**` **except** `flow/`, `hub/src/lib/{time.ts,api.ts additions}`, row-links in ProjectsScreen/HomeScreen, `tracker/project-page.md` |
| **C — BranchFlow** | `hub/src/components/project/flow/**` only + `tracker/branch-flow.md` |

Shared types for B+C are **frozen by the orchestrator** in `hub/src/lib/types.ts` before dispatch.
`BranchFlow` is purely presentational: `{ branches: OverviewBranch[]; onSelect?: (name: string |
null) => void }` — no fetching, internal focus state only.

### 18.5 v4 Definition of Done
- [ ] `GET /api/projects/:id/overview` live for all 6 seeded + real catalog projects; 404 otherwise;
      proptests pin §18.2 invariants; workspace gates green.
- [ ] `/projects/:id` renders the full dashboard from the live API (loading + error states styled);
      Projects/Home rows navigate to it.
- [ ] BranchFlow: hover lift/dim, click focus mode, keyboard nav, entrance animation — tested.
- [ ] Hub gates green (tsc, Vitest incl. fast-check `timeAgo` + generator-shape guards).
