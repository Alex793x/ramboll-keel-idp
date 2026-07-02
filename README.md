# Keel — the project-initialization layer of the Ramboll Developer Platform

> **Bright ideas. Sustainable change.**

**Keel** is the project-initialization layer of the **Ramboll Developer Platform (RDP)**.
A Ramboll engineer signs in, **selects a department and the users** who will own the project,
picks the Python golden-path blueprint, answers a short form, and — in minutes — gets a **real
GitHub repository** that is standards-compliant and **green from its first commit**.

In shipbuilding, *laying the keel* is the formal start of construction: the structural backbone
every other part is fastened to, and the reference from which the whole vessel is measured. Keel
does the same for a software project.

---

## Why Keel exists

Every Ramboll software project begins with the same invisible tax. Before a single line of business
logic is written, a team spends days assembling the same scaffolding — a repository, a branching
model, a CI pipeline, a documentation site, security settings — and does it *slightly differently
every time*. Three concrete problems follow (whitepaper §1):

| Problem | What it costs |
| --- | --- |
| **The cold-start tax** | Creating a repo, folder layout, branches + protection, CI, linting, docs, and access is days of undifferentiated work — or it gets skipped under deadline and surfaces later as an audit finding or incident. |
| **Configuration drift** | No two hand-scaffolded projects are alike: `master` vs `main`, no `staging`, CI that does different things or nothing, docs in five places. Drift raises the cost of moving engineers, defeats org-wide tooling, and means every security fix is rediscovered per repo. |
| **Standards that live in prose, not code** | Standards in wiki pages and onboarding decks are out of date the day they're written and nobody reads them at the only moment they matter — project creation. A standard that is not executable is a suggestion. |

> **The core insight.** The cheapest, most durable place to enforce a standard is *at
> initialization, by construction* — so compliance is the default and divergence is the deliberate,
> visible exception. Keel exists to make the right way the easy way, and the default way.

---

## v2 architecture at a glance

Keel v2 is a **Rust Cargo workspace** (the orchestration engine) behind a **TanStack Start** hub
(the experience), creating real repositories through the user's `gh` CLI from a version-controlled
**blueprint** wired to **reusable GitHub Actions**.

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

The Rust workspace is six crates, each with a single responsibility and dependency-inverted I/O:

| Crate | Responsibility |
| --- | --- |
| `keel-core` | Domain types, the `RepoProvider` trait, errors. Dependency-light (serde, thiserror). |
| `keel-blueprint` | Manifest load/validate + MiniJinja rendering of the template tree. |
| `keel-github` | `RepoProvider` implementations: `OctocrabProvider` (typed SDK, recommended), `GhCliProvider` (subprocess `gh`/`git`), `LocalDirProvider`, `FakeProvider`. |
| `keel-engine` | The 8-step idempotent workflow orchestrator + JSON catalog/audit. |
| `keel-api` | axum HTTP server (default `:8787`) + mocked department/user data. |
| `keel-cli` | Headless `init` driver — the deterministic E2E entry point. |

Full crate contracts are frozen in **[SPEC.md §3](SPEC.md)**. A deep-dive lives in
**[architecture.md](architecture.md)**.

---

## How it works — three planes, one idempotent workflow

A request flows left-to-right: the **experience plane** (hub) collects the selection, the
**orchestration plane** (Rust engine) runs the workflow, and the **integration plane** (`gh` →
GitHub) materializes a real repository.

The engine executes the **8-step idempotent workflow** (whitepaper §6). Each step is idempotent
(re-running never duplicates), audited, and emits a `ProgressEvent` the hub renders live:

| # | Event key | What happens |
| --- | --- | --- |
| 1 | `signin` | Identity established (mock SSO — any `@ramboll.com` email). |
| 2 | `form` | The `InitRequest` is validated against the blueprint manifest. |
| 3 | `render` | The blueprint template tree is rendered to in-memory `RenderedFile`s. |
| 4 | `create_repo` | A real GitHub repo is created and the initial commit is pushed to `main`. |
| 5 | `commit` | The rendered tree is committed (structured initial commit). |
| 6 | `branches` | `dev` and `staging` are created and pushed. |
| 7 | `seed_ci` | The three GitHub Actions (build/test/validate) reference the reusable workflows. |
| 8 | `register` | The project is recorded in the JSON catalog with its blueprint version. |

> Workflow order: `signin → form → render → create_repo → commit → branches → seed_ci → register`.

---

## Quickstart

**Prerequisites:** Rust (stable), Node, and the GitHub CLI `gh` authenticated with `repo` +
`workflow` scopes (the real-repo E2E path uses `gh`).

### Run the test suites

```bash
cargo test --workspace        # Rust engine: TDD + proptest, all crates green
cd hub && npm test            # Hub: Vitest + fast-check property tests
```

### Run the stack (UI path)

```bash
# Terminal 1 — the Rust API (axum, defaults to http://localhost:8787)
cargo run -p keel-api

# Terminal 2 — the TanStack Start hub
cd hub && npm run dev
```

Then in the hub (the **Ramboll Developer Hub** control-room UI, ported 1:1 from
`Ramble IDP Hub MVP Design/`):

1. **Sign in** with *Continue with Microsoft* (mock SSO stand-in for Entra ID).
2. Explore **Home**, **Projects**, and the **Knowledge Base** (living docs with declarative
   flow/sequence diagrams).
3. **Initialize a project** — name it, pick a **Global Business Area** and **contributors**, add
   **service components** (FE / API / Worker / Data pipeline / Infra) and watch the live blueprint.
4. **Initialize** runs the design's simulated 6-step provisioning and lands on the *created* screen.

> **Note:** the redesigned hub wizard is a design-faithful port (multi-service blueprints —
> simulated provisioning). Creating **real** GitHub repositories runs through `keel-api` /
> `keel-cli` below; wiring the new multi-service wizard to the engine is tracked as follow-up work.

### Headless path (CLI / E2E)

The same workflow runs without the UI via `keel-cli` — the deterministic E2E driver:

```bash
cargo run -p keel-cli -- init \
  --project demo-svc \
  --department water \
  --users u-sofia,u-tomas \
  --service-kind rest-api \
  --description "Sensor ingestion service for the Water division." \
  --author "Alex Holmberg <axth@syncable.dev>"
```

Useful flags:

| Flag | Effect |
| --- | --- |
| `--owner <login>` | GitHub account/org the new repo is created under (default `Alex793x`). |
| `--octocrab` | Create the repo through the typed **octocrab** SDK (auth from `gh auth token`) instead of the `gh` CLI. |
| `--dry-run` | Use the in-memory `FakeProvider` — renders + records, creates **no** real repo. |
| `--local <dir>` | Materialize the rendered tree to a local directory instead of GitHub. |

---

## What a generated repository contains

Every Keel-born repository follows the Python golden path and is green on commit one:

- **Structure** — `src/<package_name>/` (a keyword-safe identifier derived from the project name),
  `tests/`, `docs/`, `pyproject.toml`, `.editorconfig`, `.gitignore`.
- **Living documentation** — a real `README.md` and `architecture.md`, plus a **MkDocs** site
  (`mkdocs.yml`, `docs/index.md`, `docs/getting-started.md`, an ADR, a runbook).
- **Three AI agent skills** under `.claude/skills/` that encode Ramboll standards as agent-readable
  rules:
  - `python-clean-code` — small, typed, ruff/black/mypy-clean functions.
  - `property-based-testing` — every pure function ships a Hypothesis property test.
  - `git-ci-governance` — the branch model, Conventional Commits, and reusable-CI-only rule.
- **Three GitHub Actions** (`build`, `test`, `validate`) that **reference the central reusable
  workflows** rather than inlining pipeline logic.
- **Branch model** — `main` / `dev` / `staging` long-lived branches; working branches
  `feature/` · `bug/` · `hotfix/`. `main` is protected (PR + 1 review + CODEOWNERS + green checks).
- **CODEOWNERS** — derived from the **selected department + users**: `@<team_slug>` plus each
  selected user's GitHub login, owning the repo root, `/.github/`, and `/.claude/`.

---

## Documentation map

| Document | Purpose |
| --- | --- |
| **[architecture.md](architecture.md)** | The v2 architecture in depth — planes, crates, diagrams, dependency inversion, blueprint anatomy. |
| **[docs/](docs/index.md)** | Getting started, blueprints, governance, roadmap. |
| **[SPEC.md](SPEC.md)** | The binding contract: crate APIs (§3), HTTP API (§3.5), CLI (§3.6), hub (§4), E2E (§5). |
| **[Tracker.md](Tracker.md)** | Build tracker, area ownership, decisions log. |
| `keel_whitepaper.pdf` | *Laying the Keel* — the source vision (June 2026). |

---

*Lay the keel first. Everything else — the breadth, the day-2 governance, the intelligence — is
built upon it.*
