# Governance

Initialization sets a project on the golden path; governance keeps it there. In Keel, **standards
are enforced, not suggested** — and **no ad-hoc configuration** is allowed. The platform owns the
pipeline shape and the project shape; services reference them.

Every generated repo carries these rules both as protections on GitHub and as the embedded
`git-ci-governance` skill, so humans and AI agents are held to the same standard.

## The branch model

Three long-lived branches:

| Branch | Role | Protection |
| --- | --- | --- |
| **`main`** | Production | PR + ≥1 review + CODEOWNERS approval + green Build/Test/Validate. |
| **`dev`** | Integration — **PRs target this branch** | — |
| **`staging`** | Pre-production validation | — |

Short-lived working branches are cut from `dev` and named **exactly** `<type>/<ticket>-<slug>`:

- `feature/<ticket>-<slug>` — new behaviour
- `bug/<ticket>-<slug>` — defect fix
- `hotfix/<ticket>-<slug>` — urgent production fix

The CI branch-name check enforces:
`^(feature|bug|hotfix)/[A-Z]+-[0-9]+-[a-z0-9-]+$` (plus the protected `main`/`dev`/`staging`).

```bash
git switch -c feature/PROJ-142-health-endpoint   # ✓ accepted
git switch -c add-health                          # ✗ rejected by CI — rename it
```

## Commits — Conventional Commits

```
<type>(<optional scope>): <summary>

feat: add /health endpoint
fix: handle empty input in slugify
docs: expand runbook recovery steps
test: add property test for word_count invariance
```

Keep commits small and focused; the summary is imperative and lower-case.

## Pull requests

1. Open the PR **into `dev`** — never straight to `main`.
2. At least **one review**, and **CODEOWNERS must approve**.
3. **Build / Test / Validate must be green** — they are required checks.
4. Prefer squash-merge for a clean, linear history.

CODEOWNERS is derived from the **department + users** selected at creation (see
[Blueprints](blueprints.md) and [../architecture.md §7](../architecture.md)), so the people who own
the project are the people whose approval is required.

## The three AI skills

The embedded `.claude/skills/` are governance made agent-readable:

| Skill | Gate |
| --- | --- |
| **`python-clean-code`** | Small, typed, documented functions; no dead code; `ruff` + `black --check` + `mypy` clean. |
| **`property-based-testing`** | Every new pure public function ships ≥1 Hypothesis property test; counterexamples are bugs, not noise. |
| **`git-ci-governance`** | The branch model, Conventional Commits, PR rules, and reusable-CI-only rule above. |

## CI gates — reusable workflows only

A repo's `.github/workflows/{build,test,validate}.yml` **call the central reusable workflows by
path** and pass only inputs:

```yaml
jobs:
  build:
    uses: Alex793x/keel/.github/workflows/reusable-build.yml@main
    with:
      python-version: "3.12"
```

| Workflow | Gate |
| --- | --- |
| **Build** | Install + compile. |
| **Test** | `pytest`, including Hypothesis property tests. |
| **Validate** | `ruff`, `black --check`, `mypy`, branch-name check, `mkdocs build --strict`. |

**Never copy-paste pipeline logic into a repo workflow.** If the pipeline must change, change the
*central* reusable workflow so every service inherits the fix — **fix once, benefit everyone**. A
security fix to the pipeline ships once and propagates across the estate instead of being
rediscovered per repository.

## No ad-hoc configuration

This is the heart of the model. Standards live in versioned, reviewable, testable blueprints and
reusable workflows — not in prose and not copy-pasted per repo. A standard that is not executable is
a suggestion; Keel makes the right way the default way, and divergence the deliberate, visible
exception.

## Day-2: drift (documented future)

A project born compliant can drift as the golden path improves or the repo is hand-edited. The
catalog records each project's birth `blueprint_version`; comparing it against the current version
(and live settings against the expected policy) surfaces drift. The MVP **reports** this; the
documented frontier **remediates** it as pull requests. See [Roadmap](roadmap.md).
