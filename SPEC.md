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
> tested, and language-agnostic**: the Python golden-path **blueprint** (`blueprints/python-service/`)
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
```rust
// Domain
pub struct Department { pub id: String, pub name: String, pub team_slug: String }
pub struct User { pub id: String, pub name: String, pub email: String, pub github_login: String }
pub enum ServiceKind { RestApi, Worker }
pub struct InitRequest {            // what the form produces
    pub project_name: String,       // validated ^[a-z][a-z0-9-]{2,40}$
    pub blueprint: String,          // e.g. "python-service"
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
pub struct GhCliProvider { pub owner: String }        // shells out to `gh` + `git`
impl GhCliProvider { pub fn new(owner: String) -> Self }
impl keel_core::RepoProvider for GhCliProvider { /* … */ }

pub struct FakeProvider { /* in-memory, for tests: records created repos, branches, files */ }
impl FakeProvider { pub fn new() -> Self ; pub fn created(&self) -> Vec<RepoCoordinates> }
impl keel_core::RepoProvider for FakeProvider { /* … */ }
```
`GhCliProvider::create_repo`: render→temp dir→`git init -b main`→commit→`gh repo create
<owner>/<name> --private --source . --remote origin --push`; idempotent (if `gh repo view`
succeeds, skip). `ensure_branches`: create+push `dev`,`staging`. `write_protection`: best-effort
via `gh api` PUT branch protection (tolerate failure on personal repos → emit Skipped, also commit
a `branch-protection.json` into the repo as the durable record).

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
axum server, default `:8787`, permissive CORS for the hub dev origin.
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
| Python blueprint refine | Fleet-Blueprint-PY | `blueprints/python-service/` |
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
