---
name: git-ci-governance
description: >-
  Strict git and CI governance for this repo — no ad-hoc configuration. Use
  whenever creating branches, committing, opening PRs, or touching CI. Enforce
  the main/dev/staging model with protection, branch names matching exactly
  feature/<ticket>-<slug>, bug/<ticket>-<slug>, or hotfix/<ticket>-<slug>,
  Conventional Commits, PRs into dev with review + CODEOWNERS + green
  Build/Test/Validate, and CI that references the reusable workflows only.
---

# Git & CI governance

Standards are enforced, not suggested. **No ad-hoc configuration** — the platform
owns the pipeline shape; services reference it.

## Branch model

Three long-lived branches:

- **`main`** — production; protected (PR + 1 review + CODEOWNERS + green checks).
- **`dev`** — integration; **PRs target this branch**.
- **`staging`** — pre-production validation.

## Branch naming (enforced)

Cut short-lived branches from `dev`, named **exactly** `<type>/<ticket>-<slug>`:

- `feature/<ticket>-<slug>` — new behaviour
- `bug/<ticket>-<slug>` — defect fix
- `hotfix/<ticket>-<slug>` — urgent production fix

CI enforces the prefix rule `^(feature|bug|hotfix)/.+$` (plus the protected
`main`/`dev`/`staging`). The `<ticket>-<slug>` shape above is the **recommended
team convention** — adopt it even though CI only checks the prefix.

```bash
# Good:
git switch -c feature/PROJ-142-health-endpoint
# Rejected by CI — rename it:
git switch -c add-health   # ✗
```

**As an agent: if you are about to create or are sitting on a branch whose name
does not match, rename it (`git branch -m <correct-name>`) before committing.**

## Commits — Conventional Commits

```
<type>(<optional scope>): <summary>

feat: add /health endpoint
fix: handle empty input in slugify
docs: expand runbook recovery steps
test: add property test for word_count invariance
refactor|chore|ci|build|perf: ...
```

Keep commits small and focused; the summary is imperative and lower-case.

## Pull requests

1. Open the PR **into `dev`** (never straight to `main`).
2. At least **one review**, and **CODEOWNERS** must approve.
3. **Build / Test / Validate must be green** before merge — they are required checks.
4. Prefer squash-merge for a clean, linear history.

## CI governance — reusable workflows only

This repo's `.github/workflows/{build,test,validate}.yml` **call the central
reusable workflows by path** and pass only inputs:

```yaml
jobs:
  build:
    uses: Alex793x/keel/.github/workflows/reusable-build.yml@main
    with:
      python-version: "3.12"
```

Rules:

- **Never copy-paste pipeline logic** (setup, install, lint, test steps) into a
  repo workflow. If the pipeline must change, change the **central reusable
  workflow** so every service inherits the fix ("fix once, benefit everyone").
- Do not add bespoke workflows that duplicate Build/Test/Validate.
- Pin the reusable workflow ref (`@main`); bump deliberately.

## Checklist

- [ ] Branch name matches the enforced pattern (or `main`/`dev`/`staging`).
- [ ] Commits follow Conventional Commits.
- [ ] PR targets `dev`, has a review + CODEOWNERS approval.
- [ ] Build / Test / Validate are green.
- [ ] CI references the reusable workflows; no inlined pipeline logic.
