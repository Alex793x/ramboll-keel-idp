# Keel — Master Specification (MVP)

> **Keel** is the project-initialization layer of the **Ramboll Developer Platform (RDP)**.
> A self-service **Hub** where a Ramboll engineer signs in, picks a blueprint, answers a short
> form, and — in minutes — receives a fully bootstrapped, standards-compliant repository.
>
> Source of vision: `keel_whitepaper.pdf` ("Laying the Keel", Ramboll Developer Platform,
> Working draft, June 2026). This SPEC is the **binding contract** for the MVP build and the
> integration boundaries between work areas. `Tracker.md` tracks execution.

---

## 1. Goal of this MVP

Deliver a **working, demoable, verifiable** initialization platform that does a narrow thing
excellently (whitepaper §12 — "deliberately small, deliberately solid"):

1. A Ramboll user can **log in** to the Hub (SSO deliberately skipped for the MVP — see §4).
2. They pick the **Python** blueprint and submit a short form.
3. The **blueprint factory generator** renders a complete, standards-compliant Python
   repository on disk: best-practice folder structure, generated `README.md`, `architecture.md`,
   docs site, three embedded **AI Agent skills**, and three **GitHub Actions** (Build, Test,
   Validate) that point at **reusable, modular** workflows so updates propagate everywhere.
4. The repo is initialized as a real git repository with the `main` / `dev` / `staging`
   branching model and is recorded in the **catalog + audit log**.

The "green from birth" quality bar (whitepaper §5.3): every generated repo **compiles and
passes its own smoke + property tests on the first run.**

---

## 2. Whitepaper alignment (what we are faithful to)

| Whitepaper concept | How the MVP realises it |
| --- | --- |
| Three planes (experience / orchestration / integration) | `hub/` (experience) → `keel/` engine (orchestration) → git + CI templates (integration) |
| Blueprint = manifest + template tree + post-actions (§5) | `blueprints/python-service/blueprint.yaml` + `template/` + `postActions` list |
| Golden path, opinionated defaults (§2) | One Python blueprint encoding one strong default for layout/branches/CI/docs |
| Standards as code, not prose (§1.3, §10.1) | Standards live in the blueprint + the 3 embedded AI skills + reusable CI |
| `main`/`dev`/`staging` branching + protection (§7.2) | Created at init; protection rules emitted as `branch-protection.json` + documented |
| Seeded CI: build + lint + test, green on commit 1 (§7.3) | 3 reusable workflows referenced by every blueprint |
| Docs as a first-class citizen, GitHub Pages (§8) | MkDocs site + standard skeleton in every generated repo |
| Catalog as system of record + audit + blueprint versioning (§10.2) | `keel/catalog.py` (SQLite/JSON) records owner, language, path, blueprint version |
| Idempotent, ordered, reversible workflow (§6.1) | `keel/workflow.py` — ordered steps, re-run safe, progress events |
| Blueprints are software, tested in CI (§5.4) | Keel's own CI renders the blueprint into a throwaway repo and asserts it is green |

---

## 3. Architecture (MVP)

```
                EXPERIENCE PLANE                 ORCHESTRATION PLANE (Keel engine)        INTEGRATION PLANE
  ┌─────────────────────────────┐      ┌──────────────────────────────────────┐   ┌────────────────────┐
  │  hub/  (FastAPI + Jinja2)    │      │  keel/                                │   │  git (local repo)   │
  │  • /login  (mock auth)       │ ───▶ │  factory.py  → workflow.py            │──▶│  main/dev/staging   │
  │  • /        catalog          │      │  blueprint.py (load+validate manifest)│   │  branch protection  │
  │  • /new     short form       │      │  renderer.py  (Jinja2 over template/) │   │  (json + docs)      │
  │  • /api/initialize (SSE/JSON)│      │  catalog.py   (catalog + audit, SQLite)│  │  reusable CI (.github)│
  │  • /projects  catalog view   │ ◀─── │  emits 8 ordered progress events      │   │                    │
  └─────────────────────────────┘      └──────────────────────────────────────┘   └────────────────────┘
```

The 8-step initialization workflow (whitepaper §6, adapted for the MVP / local-git target):
1. **Authenticate** — session established at the Hub (mock; OIDC is the production path).
2. **Choose blueprint & answer form** — Hub collects parameters.
3. **Validate & render** — parameters validated against the manifest; `template/` rendered to an
   in-memory file set with Jinja2 (file *contents* and *paths* are templated).
4. **Create repository** — create the output directory and `git init` (local; GitHub octocrab is
   the production path, whitepaper §6.2).
5. **Commit structure** — write the rendered file set, one clean initial commit on `main`.
6. **Create & protect branches** — create `dev` and `staging`; emit branch-protection policy.
7. **Seed CI & docs** — CI workflows + MkDocs site ship inside the rendered tree (already green).
8. **Register & hand back** — record in catalog + audit log; return repo path, branches, docs path,
   and the CI files. "The first commit is already green."

Each step is **idempotent** (re-running does not duplicate) and **emits a progress event**.

---

## 4. Deliberate MVP deviations from the whitepaper (with rationale)

The whitepaper is a *proposal, not a final design* (its own framing). The following MVP choices
diverge and are recorded here as decisions:

| Area | Whitepaper proposes | MVP builds | Rationale |
| --- | --- | --- | --- |
| Hub/engine language | Rust (axum, tokio, octocrab…) | **Python (FastAPI + Jinja2)** | The MVP's job is to render a **Python** golden path; Python keeps the build fast, runnable, and verifiable now, and matches Ramboll's large Python population. Migration to the Rust control plane (whitepaper §4.1) is a clean later step — the three planes are preserved. |
| Identity | Entra ID OIDC SSO | **Mock session login** (`@ramboll.com`) | User instruction: "skip SSO for now." Login is a thin, swappable shim; the OIDC seam (whitepaper §9) is documented for later. |
| Repo target | GitHub via octocrab / Azure DevOps | **Local git repository** on disk | "Future changes in ownership or forking are irrelevant right now" + no remote configured. The GitHub App + octocrab path (§6.2, §9.3) is documented as the production integration; the workflow is structured so the VCS target is swappable. |
| Catalog/audit store | PostgreSQL (sqlx) | **SQLite + JSON** | Zero-infra for the MVP; same schema shape, swappable. |
| Template engine | MiniJinja (Rust) | **Jinja2 (Python)** | Jinja2 is the direct, compatible analog; templates stay portable to MiniJinja. |
| Blueprint catalog | Python + Rust + TypeScript | **Python only** | User instruction for v1. Catalog is structured for fast-follow blueprints. |

---

## 5. Repository layout & **area ownership** (no two agents touch the same subtree)

```
Ramboll/                              OWNER
├── keel_whitepaper.pdf               (source material — do not modify)
├── SPEC.md                           orchestrator (this file)
├── Tracker.md                        orchestrator (master); agents write tracker/<area>.md
├── LICENSE  .gitignore               orchestrator
├── tracker/                          each agent writes ONLY tracker/<their-area>.md
│
├── hub/                              ▣ AREA A — HUB (experience plane)
│   ├── app/  (FastAPI: main, routes, auth, deps)
│   ├── templates/  (Jinja2 HTML: base, login, catalog, new, progress, projects)
│   └── static/css/tokens.css + app.css  (Ramboll brand)
│
├── keel/                             ▣ AREA B — ENGINE (orchestration plane)
│   ├── __init__.py  factory.py  blueprint.py  renderer.py  workflow.py  catalog.py  models.py
│   └── tests/  (unit + property tests for the engine)
│   └── pyproject.toml at repo ROOT  ← Area B owns the platform packaging/deps (hub + engine)
│
├── blueprints/                       ▣ AREA C — PYTHON BLUEPRINT (the golden path)
│   └── python-service/
│       ├── blueprint.yaml
│       └── template/  (the rendered tree — see §7)
│
├── .github/                          ▣ AREA D — REUSABLE CI (integration plane)
│   ├── workflows/ reusable-build.yml reusable-test.yml reusable-validate.yml ci.yml
│   ├── actions/setup-python-env/action.yml
│   └── scripts/check_branch_name.py
│
├── README.md  architecture.md        ▣ AREA E — PLATFORM DOCS
├── CONTRIBUTING.md  SECURITY.md       (Area E)
└── docs/  (Keel platform docs)        (Area E)
```

**Shared-file rule:** the only file every agent reports into is the tracker — and they do so by
writing their **own** file `tracker/<area>.md` (never editing `Tracker.md` or another area's file),
which the orchestrator consolidates. This prevents lost updates under parallel writes.

**Dependency rule:** Area B owns the single root `pyproject.toml` listing **all** platform deps
(fastapi, uvicorn, jinja2, pyyaml, pydantic, pytest, hypothesis, ruff, black, mypy). Area A imports
from it and does **not** create a competing requirements file.

---

## 6. Integration contracts (so parallel work composes)

### 6.1 Factory API (Area B exposes → Area A consumes)
```python
# keel/factory.py
from keel.factory import Keel
keel = Keel(blueprints_dir="blueprints", output_dir="generated", store_path="keel.db")

# Synchronous render+init; returns a result object.
result = keel.initialize(
    blueprint="python-service",
    params={"project_name": "...", "owning_team": "...", "service_kind": "rest-api",
            "description": "...", "author": "..."},
    on_event=lambda ev: ...,     # ev: {"step": int, "key": str, "title": str, "status": str, "detail": str}
)
# result: {"project": str, "repo_path": str, "branches": [..], "docs_path": str,
#          "blueprint_version": str, "catalog_id": str, "events": [..]}

keel.list_projects() -> list[dict]      # catalog system-of-record for /projects
keel.list_blueprints() -> list[dict]    # catalog for the Hub landing page
```
The 8 progress events use the `key`s: `signin, form, render, create_repo, commit, branches,
seed_ci, register` (matching §3).

### 6.2 Blueprint manifest schema (Area C authors → Area B validates), `keel/v1`
```yaml
apiVersion: keel/v1
kind: Blueprint
metadata: { name, title, description, version, owner, tags: [..] }
parameters:                 # becomes the Hub form
  - { id, title, type: string|enum, required, pattern?, values?, default?, help? }
template:
  root: template            # directory under the blueprint, rendered with Jinja2
  rename: ".j2"             # strip this suffix from rendered filenames
  conditions:               # optional: render some paths only for a parameter choice
    - { when: "service_kind == 'rest-api'", paths: ["src/{{ package_name }}/api.py"] }
repository:
  visibility: internal
  default_branch: main
  branches: [main, dev, staging]
  protect: [{ branch: main, require_pull_request: true, required_reviews: 1,
              require_codeowners: true, required_checks: [build, test, validate] }]
postActions: [create_repository, commit_template, setup_branches, apply_protection,
              enable_ci, publish_docs, register_in_catalog]
```
**Derived parameters** the renderer must inject into the Jinja2 context in addition to the form
inputs: `package_name` (= `project_name` with `-`→`_`), `year` (2026), `branch_conventions`
(`feature/`, `bug/`, `hotfix/`).

### 6.3 Reusable CI contract (Area D authors → Area C references)
Every generated repo's `.github/workflows/{build,test,validate}.yml` calls the central reusable
workflows by path. Use the org placeholder **`Ramboll-RDP/keel`** and ref **`@v1`**:
```yaml
# build.yml (in generated repo)
on: { push: { branches: [main, dev, staging] }, pull_request: {} }
jobs:
  build:
    uses: Ramboll-RDP/keel/.github/workflows/reusable-build.yml@v1
    with: { python-version: "3.12" }
```
Reusable workflow names + inputs (Area D MUST implement exactly these — this is the contract):
| File | `on: workflow_call` inputs | Does |
| --- | --- | --- |
| `reusable-build.yml` | `python-version` (default 3.12) | setup env (composite), `pip install .`, import-check |
| `reusable-test.yml` | `python-version` | setup env, `pytest` incl. Hypothesis property tests |
| `reusable-validate.yml` | `python-version` | `ruff check`, `black --check`, `mypy`, branch-name check, `mkdocs build --strict` |
All three reuse the composite action `.github/actions/setup-python-env`. Updating that one action
updates every blueprint's pipeline — this is the "fix once, benefit everyone" requirement.

---

## 7. The Python blueprint `template/` tree (Area C) — what every generated repo contains

```
template/
├── pyproject.toml.j2            # ruff + black + mypy + pytest + hypothesis configured; src layout
├── README.md.j2                 # generated, not blank: what/run/docs/owner + branch model
├── architecture.md.j2          # C4-ish context, components, the 3-plane lineage, ADR pointer
├── .gitignore  .editorconfig
├── CONTRIBUTING.md.j2           # branching (feature/ bug/ hotfix/), PR + review, CI gates
├── SECURITY.md  LICENSE  CODEOWNERS.j2
├── mkdocs.yml.j2
├── docs/
│   ├── index.md.j2  getting-started.md.j2  architecture.md.j2  runbook.md  contributing.md
│   └── adr/0001-record-architecture-decisions.md
├── src/{{ package_name }}/
│   ├── __init__.py.j2  core.py.j2          # a small WORKING module (so tests pass green)
│   └── api.py.j2                            # only when service_kind == rest-api
├── tests/
│   ├── test_smoke.py.j2                     # import + basic behaviour
│   └── test_properties.py.j2                # Hypothesis property tests (round-trip/invariant)
├── .github/
│   ├── workflows/{build,test,validate}.yml  # reference the reusable workflows (§6.3)
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── ISSUE_TEMPLATE/{bug_report.md,feature_request.md}
├── .claude/skills/              # the three embedded AI agent skills (§8)
│   ├── property-based-testing/SKILL.md
│   ├── python-clean-code/SKILL.md
│   └── git-ci-governance/SKILL.md
├── CLAUDE.md.j2                  # points any agent at the skills + standards
└── AGENTS.md.j2                 # agent-agnostic equivalent (Cursor/Copilot/etc.)
```
The seeded `src` + `tests` must be **mutually consistent**: the smoke + property tests must pass
against the generated `core.py`. This is the green-from-birth bar.

---

## 8. The three embedded AI Agent skills (Area C) — exact intent

Each is a `SKILL.md` with YAML frontmatter (`name`, `description`) + a focused body. They are copied
verbatim into every generated repo under `.claude/skills/` and referenced from `CLAUDE.md`/`AGENTS.md`,
so **any** developer's coding agent automatically adopts the standards.

1. **`property-based-testing`** — Enforce property/invariant testing with **Hypothesis** during
   development. The agent must: identify properties (round-trip, idempotency, invariants,
   metamorphic, oracle) for each pure function; write `@given` strategies; keep property tests
   alongside unit tests; treat a failing/​shrinking counterexample as a real bug. Rule: every new
   public function ships with ≥1 property test.

2. **`python-clean-code`** — Strict Python maintainability. Small single-responsibility functions
   (target ≤ ~20 lines, cyclomatic complexity ≤ 10); full type hints + docstrings; descriptive
   names; guard clauses over deep nesting; DRY; no dead code; pure functions where possible; code
   must pass `ruff`, `black`, and `mypy` clean. Explicit over implicit.

3. **`git-ci-governance`** — Strict git + CI standards, **no ad-hoc configuration**. Branching:
   `main`/`dev`/`staging` with protection; work on short-lived branches named **exactly**
   `feature/<ticket>-<slug>`, `bug/<ticket>-<slug>`, or `hotfix/<ticket>-<slug>` (the agent must
   reject/rename anything else). Conventional Commits. PRs into `dev`, review + CODEOWNERS, and the
   Build/Test/Validate checks must be green before merge. CI must always reference the **reusable
   workflows** — never copy-paste pipeline logic into a repo.

---

## 9. Brand tokens (Area A) — sampled from `keel_whitepaper.pdf` (authoritative Ramboll reference)

Create `hub/static/css/tokens.css` from these **exact** values. Tagline: **"Bright ideas. Sustainable change."**

```css
:root{
  --rb-navy:      #0B2947;  /* deep navy — headers, footer, primary surfaces */
  --rb-navy-ink:  #122A43;  /* near-black navy — body text, table headers     */
  --rb-blue:      #155FB0;  /* heading / link / section-number blue           */
  --rb-cyan:      #1AA7C8;  /* Ramboll cyan — primary accent / CTAs           */
  --rb-amber:     #E0A33E;  /* gold/amber — rules & highlights                */
  --rb-panel:     #EAF2FA;  /* light blue panel background                    */
  --rb-panel-cy:  #EAF7F9;  /* light cyan panel                               */
  --rb-amber-tint:#FBF1DD;  /* light amber callout                            */
  --rb-bg:        #F4F8FC;  /* page background                                */
  --rb-border:    #B4C1C8;  /* hairline borders                              */
  --rb-white:     #FFFFFF;
  --rb-font:  "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif;
  --rb-mono:  "DejaVu Sans Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
```
Visual language to mirror from the whitepaper: navy header bar with the wordmark "Ramboll
Developer Platform" / "Keel"; gold/amber horizontal rule under section headings; blue section
headings; clean cards with hairline borders; light blue/cyan info panels.

---

## 10. MemTrace fleet protocol (every agent MUST follow)

MemTrace is active for this repo. Every spawned agent must:
1. Use MemTrace **first** for code discovery (`mcp__memtrace__find_code` / `find_symbol`) instead of
   blind grep, per the active MemTrace policy.
2. At **start**, publish intent: load the fleet tools via `ToolSearch` (`select:mcp__memtrace__fleet_publish_intent,mcp__memtrace__fleet_record_episode,mcp__memtrace__fleet_status`) and call
   `fleet_publish_intent` with the area name + the files/subtree it will own.
3. At **end**, call `fleet_record_episode` summarising what changed (files created, decisions).
4. If a fleet tool errors, note it in `tracker/<area>.md` and continue — do not block on it.

This gives the fleet shared, queryable visibility across the parallel build.

---

## 11. Definition of done (verified by the orchestrator after the fleet returns)

- [ ] `pip install -e .` succeeds; `keel/` imports cleanly.
- [ ] `Keel().initialize("python-service", …)` generates `generated/<name>/` as a git repo with
      `main`/`dev`/`staging`, an initial commit, and the full §7 tree.
- [ ] In the generated repo: `pip install -e . && pytest` is **green** (smoke + property tests).
- [ ] `ruff check`, `black --check`, `mypy` pass in the generated repo.
- [ ] The generated `.github/workflows/{build,test,validate}.yml` reference the reusable workflows.
- [ ] The Hub starts (`uvicorn`), `/login` → catalog → `/new` → initialize works end-to-end.
- [ ] The generated repo contains the three `.claude/skills/*/SKILL.md` and `CLAUDE.md`/`AGENTS.md`.
- [ ] Catalog + audit log record the project with its blueprint version.
- [ ] `Tracker.md` reflects all areas complete.
