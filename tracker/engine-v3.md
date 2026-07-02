# Fleet-Engine-V3 — `crates/keel-engine/` + `crates/keel-blueprint/`

**Status: ✅ done.** v3 multi-repo + monolith workflows implemented per SPEC §12; legacy v2 path
byte-identical (existing tests untouched and green). Gates: `cargo fmt --all` clean,
`cargo clippy --workspace --all-targets -- -D warnings` clean,
`cargo test -p keel-engine -p keel-blueprint` → **48 passed, 0 failed**
(keel-blueprint 26 unit + 1 integration; keel-engine 7 unit + 6 legacy integration + 8 v3
integration). Full `cargo test --workspace` also green at hand-off.

## Scope honored
- Touched **only** `crates/keel-blueprint/` and `crates/keel-engine/` (+ their `tests/`).
- Frozen v2 surfaces unchanged (`load_manifest`, `validate_request`, `derive_context`, `render`,
  `Engine::{new,with_catalog,initialize,list_projects}`). All additions are additive.
- No new external deps. No prod `unwrap`/`expect` (tests only).

## New public APIs (keel-blueprint)
```rust
/// Per-service template context (exported from crate root).
pub struct ServiceCtx {
    pub tag: String,       // fe|api|wk|dp|inf
    pub dir: String,       // monolith services/ dir ({tag} | {tag}-{n})
    pub lang: String,      // language slug
    pub label: String,     // e.g. "Backend API"
    pub repo_name: String, // multi-repo name ({slug}-{tag} | {slug}-{tag}-{n})
} // Debug, Clone, PartialEq, Eq, Serialize

/// v2 context + `layout` (req.layout.as_token()) + `service` (object, when Some)
/// + `services` (array, when non-empty). Delegates to derive_context internally.
pub fn derive_context_v3(
    req: &InitRequest,
    service: Option<&ServiceCtx>,
    services: &[ServiceCtx],
) -> serde_json::Map<String, serde_json::Value>;

/// Render the template tree against a pre-built context map. Renderer rules identical to
/// `render` (path interpolation, `.j2` strip, verbatim copy, conditions); only the context
/// source differs. `render(m, dir, req)` now == `render_with_context(m, dir, &derive_context(req))`.
pub fn render_with_context(
    manifest: &Manifest,
    blueprint_dir: &Path,
    ctx: &serde_json::Map<String, serde_json::Value>,
) -> keel_core::Result<Vec<RenderedFile>>;
```
Property (tested): `derive_context_v3(req, None, &[])` ≡ `derive_context(req)` + the `layout` key.

## keel-engine — workflow refactor (`src/workflow.rs` + `src/workflow/{legacy,multi,mono}.rs`)
Dispatch in `workflow.rs::run`: `req.services.is_empty()` ⇒ `legacy` (v2, byte-identical);
otherwise `req.layout` ⇒ `multi` / `mono`. Shared in the parent module: `EventLog` (collects the
audit trail + fires the live callback; replaces the old `record!` macro), `STEP_TITLES`,
`default_branch`/`branch_set` fallbacks, `branch_protection_file`, `ensure_branches_and_protection`
(union branches + best-effort protection), `resolve_services`/`ServicePlan`,
`available_service_blueprints`, `build_service_ctxs`.

### Multi-repo (`multi.rs`)
- Each selection ⇒ `blueprints/services/{tag}-{lang}` (`ServiceSelection::blueprint_name()`);
  missing dir ⇒ `KeelError::Validation` naming the combo and listing every available blueprint
  (scan of the services dir; `"(none)"` when empty/missing).
- Renders each service with `derive_context_v3(req, Some(ctx_i), &all_ctxs)`; repo `i` named
  `service_repo_names(project, services)[i]`. Every repo also commits `branch-protection.json`
  (from its own manifest).
- Still exactly 8 canonical events. Steps 4/5 aggregate: Done `"created 2 repo(s): demo-api,
  demo-fe"` (+ `"(k already existed)"` when mixed) / **Skipped when ALL existed**
  (`"all N repo(s) already exist: …"`). Step 6 aggregates branches+protection across repos.
- Per-repo idempotency identical to legacy (repo_exists → idempotent create_repo reuse).
- Outcome: `repos` = all coordinates (selection order), `repo` = repos[0],
  `blueprint_version` = FIRST service's manifest version, `docs_path` = `"{first_repo}/docs"`,
  catalog row keyed on `(owner, project_name)` (one row per project, upsert-replaced).
- Commit message per repo: `"chore: scaffold from Keel {tag}-{lang} blueprint"`.

### Monolith (`mono.rs`)
ONE repo `{project_name}`; composed file set:
1. `blueprints/monolith-root/` (blueprints_dir root + `"monolith-root"`, sibling of `services/`)
   rendered with the root context (`services` array populated, no `service`); missing dir ⇒
   `KeelError::Validation`.
2. Each service blueprint rendered with its `ServiceCtx`, then DROP root-owned paths
   (prefix `.github/` or `.claude/`; exact `LICENSE`/`SECURITY.md`/`CODEOWNERS`/`CONTRIBUTING.md`)
   and PREFIX the rest `services/{dir}/`. (Nested files with those NAMES are kept — only exact
   root-level matches drop; unit-tested.)
3. `keel.services.json` — engine-serialized via `ServicesManifest::new(project, services).to_json()`
   (never a template).
4. `branch-protection.json` from the **root** manifest (root owns governance).
Create/commit/branches/protection as one repo; idempotent exactly like legacy (4+5 Skipped when
the repo exists). `blueprint_version` = monolith-root manifest version (see Deviations).

## Fixture layout (hermetic; independent of the real `blueprints/` authored in parallel)
```
crates/keel-engine/tests/fixtures/
├── fixture-service/            # pre-existing legacy fixture (untouched)
├── monolith-root/
│   ├── blueprint.yaml          # keel/v2, version 0.9.0, protect main (checks: [gate])
│   └── template/{README.md.j2, CODEOWNERS.j2, docs/index.md.j2, .github/workflows/ci.yml}
└── services/
    ├── api-python/             # keel/v2, version 0.3.0, metadata.service {api, python}
    │   └── template/{README.md.j2, src/{{ package_name }}/main.py.j2,
    │                 .github/workflows/ci.yml (verbatim ${{ }}), CODEOWNERS.j2, LICENSE}
    └── fe-react/               # keel/v2, version 0.4.0, metadata.service {fe, react}
        └── template/{README.md.j2, package.json.j2,
                      .github/workflows/ci.yml (verbatim ${{ }}), SECURITY.md, CONTRIBUTING.md}
```
Root-owned files (`.github/`, CODEOWNERS, LICENSE, SECURITY.md, CONTRIBUTING.md) are deliberately
present in the service fixtures so the monolith strip rules are actually exercised.

## Tests
- **keel-blueprint (27):** all pre-existing (21) untouched; + `v3_context_injects_layout_service_and_services`,
  `v3_context_omits_service_and_services_when_absent`, proptest `v3_without_service_is_v2_plus_layout`,
  `render_with_context_matches_render_for_v2_context`, `render_with_context_exposes_v3_service_vars`.
- **keel-engine (21):** legacy `tests/initialize.rs` (6) **unmodified** and green; catalog unit (5);
  mono unit (2: strip-rule table, compose filter+prefix); `tests/v3.rs` (8):
  - `multi_repo_creates_one_repo_per_service_with_ordinal_names` — 2 repos `demo-api`/`demo-fe`,
    8 canonical events, aggregated details, per-repo README/ctx/branch-protection/verbatim CI,
    repos len 2, repo==repos[0], version `0.3.0`, docs_path `demo-api/docs`.
  - `multi_repo_repeated_type_gets_ordinals` — `demo-api-1, demo-fe, demo-api-2`.
  - `multi_repo_rerun_is_idempotent` — create/commit Skipped, still 2 repos + 1 catalog row,
    file sets unchanged (1 commit-equivalent per repo).
  - `multi_repo_missing_combo_lists_available_blueprints` — Validation error lists
    `api-python, fe-react`; nothing created.
  - `monolith_local_dir_materializes_composed_tree` — LocalDirProvider: real dir with
    `services/api/…`, `services/fe/…`; `keel.services.json` parses back to `ServicesManifest`
    with dirs == `service_dirs`; NO `.github/`/`.claude/`/stripped files under `services/*`;
    root fixture files present (README/CODEOWNERS/docs/ci.yml with `${{ }}` intact);
    exactly 1 git commit; main/dev/staging exist.
  - `monolith_rerun_is_idempotent` — Skipped create/commit, 1 repo, 1 catalog row.
  - proptest `events_always_canonical_for_both_layouts` (services 1..8, both layouts) — keys ==
    WORKFLOW_STEPS in order; multi names == `service_repo_names`; repo==repos[0].
  - proptest `monolith_composition_respects_strip_and_prefix_rules` — no `services/…` path ends
    with a stripped filename or contains `.github//.claude/`; every `services/…` path prefixed by
    an ordinal-rule dir; every dir materialized; manifest present + parses with N entries.

## Deviations / judgment calls (all additive, none contract-breaking)
- **Monolith `blueprint_version`** = monolith-root manifest version (spec pins "first service's
  version" only for multi-repo; the root blueprint governs a monolith).
- **Monolith `docs_path`** = `"{project_name}/docs"` (legacy-shaped; single repo).
- Multi-repo catalog row keyed on `(owner, project_name)` — one row per project carrying all
  repos, keeping `list_projects` round-trip + idempotent upsert semantics.
- Step-5 detail on mixed create (some repos existed) is Done and lists created repos; Skipped is
  emitted only when ALL existed (per spec).
- `validate_request` runs against **every** resolved manifest (root + each service) before render.
- `metadata.service` in fixtures is informational (parser ignores unknown fields); resolution is
  by directory name, per SPEC §12.

## Coordination note
Mid-session the workspace briefly failed to compile (E0583: `mod mono` declared before
`workflow/mono.rs` was written — connection drop between file writes). Resolved by completing
`mono.rs`; `cargo build --workspace` verified green before continuing, unblocking the API/CLI agent.
