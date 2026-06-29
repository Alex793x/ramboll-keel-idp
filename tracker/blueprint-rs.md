# Fleet-Blueprint-RS — `crates/keel-blueprint/`

**Status: ✅ done.** `cargo build -p keel-blueprint` + `cargo test -p keel-blueprint` green
(22 tests: 21 unit/lib + 1 integration). `cargo clippy -p keel-blueprint` clean (no warnings).

## What I implemented

Replaced the four `todo!()` bodies in `src/lib.rs` and split the implementation into private modules
(no frozen public signature changed; added public `template`/`post_actions` fields to `Manifest` and
new public `TemplateSpec`/`Condition` types — additive only).

- **`load_manifest(dir)`** (`src/manifest.rs`) — reads `<dir>/blueprint.yaml`, deserializes into a
  private `RawManifest` matching the nested YAML shape (`apiVersion`, `kind`, `metadata{…}`,
  `parameters[]`, `template{root,rename,conditions}`, `repository{visibility,default_branch,branches,
  protect[]}`, `postActions`), then converts to the flat `Manifest`. Maps YAML `type` → `Parameter.kind`,
  and `repository.protect[].{branch,required_reviews,require_codeowners,required_checks}` →
  `keel_core::ProtectionPolicy`. `template` defaults to `root="template"`, `rename=".j2"` when absent.
- **`validate_request(m, req)`** — `req.validate_basic()?` first, then per required manifest parameter:
  `project_name` (keel-core rule + manifest anchored pattern), `service_kind` ∈ `values`,
  `description`/`author` non-empty, `owning_team` satisfied by `department.team_slug`. Returns
  `KeelError::Validation` on any failure.
- **`derive_context(req)`** (`src/context.rs`) — builds the `serde_json::Map` with `project_name,
  blueprint, description, author, service_kind` (token), `package_name` (= `to_package_name`), `year`
  (computed from `SystemTime` via a dependency-free civil-from-days algorithm; falls back to 2026),
  `branch_conventions{feature:"feature/",bug:"bug/",hotfix:"hotfix/"}`, `department{id,name,team_slug}`,
  `users[]{id,name,email,github_login}`. Also surfaces `owning_team` = `department.team_slug` top-level
  so the current `CODEOWNERS.j2` (which references `{{ owning_team }}`) renders the team slug.
- **`render(m, dir, req)`** (`src/renderer.rs`) — walks `<dir>/<template.root>` recursively (sorted for
  determinism). Frozen renderer rules implemented exactly: (a) `{{ }}` interpolated in every path
  segment always; (b) contents rendered through MiniJinja only when the filename ends in the rename
  suffix `.j2`, then suffix stripped from the destination; (c) all other files copied verbatim (raw
  bytes); (d) `template.conditions` honored — `when` evaluated via MiniJinja, condition `paths` are
  themselves interpolated and compared against the rendered destination path (include iff some
  governing condition is truthy; ungoverned paths always included). Returns `Vec<RenderedFile>` with
  forward-slash, repo-relative paths.

## Tests

- Kept/extended the `to_package_name` proptests (hyphen-free + idempotent).
- `manifest.rs`: parses sample YAML into the flat struct (incl. type→kind and protection mapping),
  template defaults, and validation units — rejects bad project_name / missing required description /
  empty author / no users; accepts a valid request; worker allowed by enum.
- `context.rs`: context keys/values, plausible year, civil-year known dates (1970/2000/2026).
- `renderer.rs`: **hermetic fixture** built in a `tempfile::TempDir` (does NOT depend on the real
  blueprint). Units + proptests: verbatim file with literal `${{ matrix.x }}` is byte-identical;
  `.j2` rendered + suffix stripped; `{{ package_name }}` path segment interpolated; a `when` condition
  includes (rest-api) / excludes (worker) correctly; verbatim bytes never change under any project
  name; no `.j2` suffix ever leaks.
- `tests/python_service.rs`: ONE integration test loads the REAL `../../blueprints/python-service`,
  validates + renders for a sample `InitRequest` (Buildings dept + 2 users), and asserts: `CODEOWNERS`
  exists/non-empty; the three `.claude/skills/*/SKILL.md` exist; the three
  `.github/workflows/{build,test,validate}.yml` exist and are byte-identical to source (verbatim);
  `src/invoicing_api/core.py` exists; no `.j2` leaks.

## Notes for the orchestrator / cross-agent

- **CODEOWNERS (Fleet-Blueprint-PY dependency):** the current `CODEOWNERS.j2` references
  `{{ owning_team }}` only, so the rendered file contains the **department team slug** but NOT the
  individual selected `github_login`s. Per spec, the integration test asserts CODEOWNERS existence
  unconditionally and applies the team-slug + per-login content checks **tolerantly** (prints a NOTE,
  does not fail). Once Fleet-Blueprint-PY refines the template to list `users[].github_login`, the
  test's strict branch activates automatically — no test change needed. The context already exposes
  `department.team_slug` and full `users[]` with `github_login`, so the PY agent has everything.
- **Workflows (`${{`) (Fleet-CI dependency):** the current `build/test/validate.yml` use `uses:`/`with:`
  referencing reusable workflows and contain **no `${{` expressions yet**. The integration test
  guarantees verbatim copying by asserting **byte-identity to source** (the real frozen guarantee), and
  applies the `${{` substring check tolerantly (NOTE printed). The hermetic renderer test independently
  proves `${{ matrix.x }}` survives verbatim. Once Fleet-CI introduces `${{`, the strict branch
  activates automatically.
- No new external crate dependencies were added (used `keel-core, serde, serde_json, serde_yaml,
  minijinja`; dev `proptest, tempfile`). No frozen public signature changed.

## MemTrace

- `fleet_publish_intent` OK — intent_id `01KW8C1P98AVRRJ51S5QYKZP4Q`, no active conflicts
  (`coordination.advice = "clear"`).
- `fleet_record_episode` recorded at completion (see episode result).
