---
name: git-ci-governance
description: >-
  Strict git and CI governance for this repo — no ad-hoc configuration. Use
  whenever creating branches, committing, opening PRs, or touching CI. Enforce
  the main/dev/staging model with protection, branch names matching exactly
  feature/<ticket>-<slug>, bug/<ticket>-<slug>, or hotfix/<ticket>-<slug>,
  Conventional Commits, PRs into dev with review + CODEOWNERS + green
  build/test/validate, and CI that keeps the platform's three-check shape.
---

# Git & CI governance

Standards are enforced, not suggested. **No ad-hoc configuration** — the platform
owns the pipeline shape; services follow it.

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

The platform convention is the prefix rule `^(feature|bug|hotfix)/.+$` (plus the
protected `main`/`dev`/`staging`). The `<ticket>-<slug>` shape above is the
**recommended team convention** — adopt it even where only the prefix is checked.

```bash
# Good:
git switch -c feature/PROJ-142-health-endpoint
# Violates the policy — rename it:
git switch -c add-health   # ✗
```

**As an agent: if you are about to create or are sitting on a branch whose name
does not match, rename it (`git branch -m <correct-name>`) before committing.**

## Commits — Conventional Commits

```
<type>(<optional scope>): <summary>

feat: add /health endpoint
fix: handle empty path in normalization
docs: expand README quickstart
test: add property test for idempotence
refactor|chore|ci|build|perf: ...
```

Keep commits small and focused; the summary is imperative and lower-case.

## Pull requests

1. Open the PR **into `dev`** (never straight to `main`).
2. At least **one review**, and **CODEOWNERS** must approve.
3. **build / test / validate must be green** before merge — they are required checks.
4. Prefer squash-merge for a clean, linear history.

## CI governance — the three-check contract

This stack's toolchain does not fit the platform's Python reusable workflows,
so `.github/workflows/{build,test,validate}.yml` are **self-contained** here
(SPEC §14) — but the *shape* is still platform-owned:

- Exactly three checks named **build**, **test**, **validate** — the names are
  wired into branch protection. Never rename or remove them.
- Keep each workflow a thin, boring wrapper around the repo's own scripts
  (`dotnet build` / `dotnet test` / warning-clean `-warnaserror` gates). Logic belongs
  in the repo's tooling config, not in YAML.
- Do not add bespoke workflows that duplicate build/test/validate.
- When the platform ships reusable workflows for this stack, switch these
  callers over and delete the inlined steps.

## Checklist

- [ ] Branch name matches the enforced pattern (or `main`/`dev`/`staging`).
- [ ] Commits follow Conventional Commits.
- [ ] PR targets `dev`, has a review + CODEOWNERS approval.
- [ ] build / test / validate are green.
- [ ] Workflows keep the three-check shape; no pipeline logic beyond the repo's own scripts.
