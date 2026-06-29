# Area 8 — Platform docs (Fleet-Docs)

**Status:** ✅ done
**Owner:** Fleet-Docs
**Exclusive subtree:** `README.md`, `architecture.md`, `docs/`

---

## Files written

| File | Purpose |
| --- | --- |
| `README.md` | Front door. What Keel is (project-init layer of the RDP), the problem (cold-start tax, drift, standards-in-prose — whitepaper §1), the v2 architecture (Rust workspace `keel-{core,blueprint,github,engine,api,cli}` + TanStack Start hub), the 3 planes + 8-step idempotent workflow table with exact event keys (`signin → form → render → create_repo → commit → branches → seed_ci → register`), Quickstart (`cargo test --workspace`, `cargo run -p keel-api`, `cd hub && npm run dev`, sign in with `@ramboll.com`, select dept + users → real repo), the headless CLI path (`cargo run -p keel-cli -- init …` with `--owner`/`--dry-run`/`--local`), what a generated repo contains, and links to SPEC/Tracker/architecture/whitepaper. |
| `architecture.md` | v2 architecture in depth: 3 planes → crates + hub; mermaid component diagram; mermaid sequence of the 8-step workflow (hub → keel-api → keel-engine → keel-blueprint → RepoProvider → gh → GitHub); `RepoProvider` dependency inversion (GhCli vs LocalDir vs Fake) and testability; blueprint anatomy (manifest + template tree + post-actions; `.j2`-vs-verbatim rule); catalog/audit JSON + blueprint versioning; dept/users → CODEOWNERS; reusable-CI "fix once, benefit everyone"; technology choices; documented future (octocrab + GitHub App, Entra ID OIDC, drift detection, self-updating blueprints). |
| `docs/index.md` | Docs landing + why Keel exists + read-next map. |
| `docs/getting-started.md` | Install Rust + Node + `gh`; run tests; run the stack; create first repo via UI and via CLI (with flags + dept/user IDs). |
| `docs/architecture.md` | Links to root `architecture.md` with a summary of what it covers. |
| `docs/blueprints.md` | How blueprints work, the manifest, the `.j2`-vs-verbatim renderer rule, the render context, the 3 AI skills, how to add a blueprint. |
| `docs/governance.md` | Branch model (`main`/`dev`/`staging` + `feature`/`bug`/`hotfix`), the 3 AI skills, CI gates (reusable workflows only), no ad-hoc config, day-2 drift. |
| `docs/roadmap.md` | Whitepaper phased roadmap (Phase 0–3) with a mermaid timeline, Q4 in/out of scope, frontier capabilities, MVP-built-for-future seams, success metrics. |

Overwrote the placeholder `README.md`. Created `architecture.md` and the `docs/` tree (6 files).

## Sources grounded against (read-only)

- `SPEC.md` (full) — §2 architecture, §3 crate contracts, §3.5 HTTP API, §3.6 CLI, §4 hub, §5 E2E.
- `Tracker.md` — decisions D-01…D-06, integration contracts.
- `fixtures/mock-data.json` — 6 departments (Ramboll divisions) + users; `team_slug`, `github_login`.
- `blueprints/python-service/` — `blueprint.yaml` manifest, `CODEOWNERS.j2`, the 3 skills, the 3
  workflows, template tree (verified file list).
- `keel_whitepaper.pdf` — §1 (problem), §2 (vision), §6 (workflow), §10 (governance/drift),
  §11 (frontier), §12 (roadmap + metrics), §13 (risks), §14 (recommendation).

## Notes / deviations honored

- Did **not** touch `crates/`, `hub/`, `blueprints/`, `.github/`, `SPEC.md`, `Tracker.md`,
  `fixtures/`, `LICENSE`. Wrote only the exclusive subtree.
- Reusable-CI org path: docs use **`Alex793x/keel/.github/workflows/reusable-*.yml@main`** per
  SPEC §6 / Tracker integration contracts. (The embedded blueprint skill/workflows reference
  `Ramboll-RDP/keel@v1` — that is Fleet-CI/Fleet-Blueprint-PY's subtree; not changed here. Flagged
  for the orchestrator as a cross-area inconsistency to reconcile.)
- 8-step event keys taken verbatim from SPEC §2; mapped to the manifest `postActions` in
  `architecture.md`.

## MemTrace

- START — `fleet_publish_intent` repo_id=`keel`, agent_id=`fleet-docs`, branch=`main`,
  assignment="Write Keel v2 platform docs", touched=`["docs::README","docs::architecture"]`,
  intent=`{"feature":{"surface":"module"}}` → intent_id `01KW8C6GVS5V7X8JWKKJJ2BDEN`,
  `active_conflicts: []`, coordination advice `clear`.
- END — `fleet_record_episode` recorded (see below).
