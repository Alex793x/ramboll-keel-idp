# Fleet-Overview-API — `GET /api/projects/:id/overview` (SPEC §18, Area A)

**Status: done.** All gates green (`cargo fmt --all` · `cargo clippy -p keel-api --all-targets -- -D warnings` · `cargo test -p keel-api` 25/25 · `cargo test --workspace` green).

## Endpoint

`GET /api/projects/:id/overview` → `200 ProjectOverviewDto` | `404 {"error": "unknown project: …"}`

- Handler `overview::project_overview` (thin): matches catalog rows via
  `state.engine.list_projects()` by `InitOutcome::project` **or** `catalog_id`; a failing
  catalog read degrades to "no rows" so the six seeded projects stay servable. People come from
  `state.data.people` (the 11 embedded contributors).
- Wiring kept minimal: one route line in `routes.rs`, `mod overview;` + DTO/generator
  re-exports in `lib.rs`. Everything else lives in `crates/keel-api/src/overview.rs`.

## Generator design (`overview(id, catalog_row, people, now_s) -> Option<ProjectOverviewDto>`)

- **Pure + deterministic.** FNV-1a(id) seeds a hand-rolled xorshift64* PRNG (no `rand`, no new
  runtime deps). Every temporal value is drawn as a stable offset, subtracted from `now_s` at
  materialization — so same `(id, now)` ⇒ byte-identical JSON, and structure (branch names,
  counts, crew, statuses) is identical across different `now` values.
- **Six seeded design rows** embedded as consts, `id/name/desc/gba/status` byte-equal to
  `hub/src/lib/hub-data.ts` PROJECTS (service counts from the design size the generated service
  lists). Layout/services/repos generated: multi-repo ⇒ `https://github.com/ramboll/<slug>-<tag>`
  per service, monolith ⇒ single `<slug>` repo + `monolith-root` blueprint.
- **Real catalog rows** contribute real facts: `repos` (name/html_url/default_branch),
  `blueprint_version`, project name; status `Healthy`; gba/description picked deterministically
  from pools. Layout/services inferred best-effort from `{slug}-{tag}` repo-name suffixes
  (no parseable tag ⇒ monolith). `initialized_by` is picked deterministically from `people` and
  documented as best-effort — the engine catalog does not persist the author.
- **Branches**: exactly one main/staging/dev rail (ahead/behind 0, author null, ci from latest
  run, promote/merge commit messages) + 1..=5 working branches named
  `(feature|bug|hotfix)/rmb-<id digits>-<slug>` (kind-weighted 7/2/1, slugs picked without
  replacement so names are unique), each with author from people, ahead 1..=8, behind 0..=3,
  ≤5 desc-sorted conventional commits (tip = commits[0]), PR on ~half (target dev,
  reviews_done ≤ reviews_required ≤ 2).
- **Runs**: 3..=8, workflows build|test|validate (+ gate only on monoliths), newest first with
  globally unique `started_at` offsets (so "latest run per branch" is unambiguous),
  `duration_s: None ⇔ running|queued`, else 30..=600s, `trigger_sha` = branch tip. Seeded
  projects always get ≥1 running run (newest is promoted if the draw produced none). A branch
  whose latest run is `queued` has that run settled to `passed` first, keeping the branch `ci`
  vocabulary at running|passed|failed|none while `ci == latest run status` stays exact.
- **Team**: 3..=6 people (partial Fisher–Yates), first 1..=2 owners, `active_branch` is a real
  working-branch name on ~half. **Feed**: all branch commits merged, desc, capped at 20.
- Guard: empty `people` ⇒ `None` (authors must be drawn from people; never hit in prod).

## Invariants pinned by tests (11 tests in `overview.rs`, incl. 1 proptest @ 64 cases)

1. Determinism — same `(id, now)` twice ⇒ identical serialized JSON (seeded + catalog row).
2. Structure stable across `now` — branch names, team (login/role/active_branch), run
   (workflow/branch/status) tuples, feed size.
3. Proptest over arbitrary ids × {no row, multi-repo row, monolith row} × arbitrary now:
   exactly one main/staging/dev; 1..=5 regex-valid working branches; working ahead ≥ 1; rails
   ahead/behind = 0; all timestamps ≤ now; per-branch commits + flat feed desc-sorted;
   `duration_s = None ⇔ running|queued`; branch `ci` == latest run status (or `none`);
   authors/`triggered_by`/team/`initialized_by` ∈ people logins; feed ≤ 20; branch commits ≤ 5;
   runs 3..=8 newest-first on real branches with tip `trigger_sha`; gate ⇒ monolith;
   `active_branch` ∈ real working branches; owners-first team; plus: a supplied catalog row
   always yields `Some`, and determinism + structure-stability re-checked per case.
4. Seeded ids ⇒ Some with name/desc/gba/status byte-equal to hub-data.ts (literals duplicated
   in the test as a drift tripwire); unknown/empty id ⇒ None.
5. Axum oneshot: 200 + parseable §18.1 body for RMB-EN-042; 404 + `{error}` for `nope`.
6. Every seeded project has ≥1 running run.

## Deviations from the brief

- `crates/keel-api/Cargo.toml` gained one dev-dependency line (`proptest = { workspace = true }`,
  already a workspace dep) — required for the mandated proptest block; `Cargo.lock` updated
  accordingly. No runtime dependencies added.
- SPEC §18.2 says real rows contribute `layout`/`services`; `InitOutcome` does not persist
  either, so they are inferred from repo-name suffixes (documented in the module).
