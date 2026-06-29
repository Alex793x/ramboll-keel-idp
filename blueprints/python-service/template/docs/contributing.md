# Contributing

This page mirrors the repository's `CONTRIBUTING.md` for the docs site. The
canonical copy lives at the repository root.

## Branching model

- Long-lived branches: **`main`** (production), **`dev`** (integration), **`staging`** (pre-prod).
- Work happens on short-lived branches off `dev`, named **exactly** one of:
  - `feature/<ticket>-<slug>` — new behaviour
  - `bug/<ticket>-<slug>` — defect fix
  - `hotfix/<ticket>-<slug>` — urgent production fix
- Anything not matching these names is rejected by the branch-name check in CI.

## Pull requests

- Open PRs **into `dev`**.
- A review is required, and **CODEOWNERS** must approve.
- The **Build / Test / Validate** checks must be green before merge.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

## Quality gates

- Every new public, pure function ships with **at least one property test** (Hypothesis).
- Code must pass `ruff`, `black --check`, and `mypy` cleanly.
- CI must always reference the **reusable workflows** — never copy pipeline logic into the repo.

See the embedded AI agent skills under `.claude/skills/` for the full standards.
