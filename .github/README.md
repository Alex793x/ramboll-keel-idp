# Keel — Reusable, Modular CI (integration plane)

This directory is the **central CI library** for the Ramboll Developer Platform
(RDP). It holds the *reusable* GitHub Actions that **every** blueprint-generated
repository points to, plus Keel's own continuous integration.

> **The point:** avoid pipeline copy-paste. A generated repo ships tiny caller
> workflows that delegate to the reusable workflows here. **Fix the build, test,
> or validate logic once in this directory and every existing and future repo
> instantly inherits the change** — no per-repo edits, no drift.

---

## Layout

```
.github/
├── actions/
│   └── setup-python-env/action.yml   # composite action — the shared building block
├── scripts/
│   └── check_branch_name.py          # standalone, unit-testable branch-name rule
└── workflows/
    ├── reusable-build.yml            # on: workflow_call — build & import check
    ├── reusable-test.yml             # on: workflow_call — pytest (smoke + property)
    ├── reusable-validate.yml         # on: workflow_call — lint/format/types/governance/docs
    └── ci.yml                        # Keel's OWN CI (lint+test+ "blueprint is software")
```

---

## The reusable workflow contract

Generated repos call these by **path + ref**, using the org placeholder
`Ramboll-RDP/keel` and the `@v1` ref convention:

| Reusable workflow | `on: workflow_call` inputs | What it does |
| --- | --- | --- |
| `reusable-build.yml`    | `python-version` (default `"3.12"`) | setup env (composite), `pip install .`, `compileall` import check, `python -m build` if available |
| `reusable-test.yml`     | `python-version` (default `"3.12"`) | setup env (composite), `pytest -q` (smoke + Hypothesis property tests) |
| `reusable-validate.yml` | `python-version` (default `"3.12"`) | setup env (composite), `ruff check`, `black --check`, `mypy`, branch-name governance, `mkdocs build --strict` (if `mkdocs.yml`) |

These names and inputs are an **API contract**: Area C (the blueprint) generates
caller workflows against exactly these signatures.

### `@v1` ref convention

Callers pin to a moving major tag `@v1` (not a branch, not a commit SHA). This
gives every repo a stable, curated line of updates: backwards-compatible fixes
and improvements ship by re-pointing `v1` at a newer commit, so all consumers
pick them up automatically. A breaking change to an input or behaviour would be
released as `@v2`, letting repos migrate deliberately.

### `Ramboll-RDP/keel` placeholder

`Ramboll-RDP` is the GitHub organisation placeholder for the MVP and `keel` is
this repository. When the platform is published under a different org, update the
`uses:` prefix in the blueprint's caller workflows — the reusable workflows
themselves do not change.

---

## How a blueprint references the reusable workflows

Each generated repo contains three thin caller workflows under its own
`.github/workflows/`. For example, `build.yml`:

```yaml
# build.yml (inside a generated repo)
on:
  push:
    branches: [main, dev, staging]
  pull_request: {}
jobs:
  build:
    uses: Ramboll-RDP/keel/.github/workflows/reusable-build.yml@v1
    with:
      python-version: "3.12"
```

`test.yml` and `validate.yml` are identical in shape, each pointing at
`reusable-test.yml@v1` and `reusable-validate.yml@v1` respectively. That is the
whole pipeline a generated repo carries — all real logic lives here.

---

## Why it is modular: the composite action

All three reusable workflows share one building block —
`actions/setup-python-env` (a **composite** action). It:

1. sets up Python (input `python-version`, default `3.12`) with pip caching,
2. upgrades pip,
3. installs the local package generically (`pip install ".[dev]"`, falling back
   to `pip install .`) **only when** packaging metadata exists — no hard-coded
   package name, so it works for any generated repo,
4. installs the standard dev toolchain (`ruff black mypy pytest hypothesis`).

Because build, test, and validate all `uses: ./.github/actions/setup-python-env`,
a single edit to that composite action updates the environment for **every**
pipeline at once. This is the concrete realisation of the "fix once, benefit
everyone" requirement.

---

## Branch-name governance

The validate workflow enforces the branch model (`main` / `dev` / `staging`
with working branches `feature/` · `bug/` · `hotfix/`):

- **Inline** in `reusable-validate.yml`: on `pull_request`, the head ref must
  match `^(feature|bug|hotfix)/.+$` or be one of `main` / `dev` / `staging`;
  otherwise the job fails with a clear message.
- **Standalone & testable** in `scripts/check_branch_name.py`: the same rule as
  a pure, typed Python utility. It reads a branch name from `argv[1]` or
  `$GITHUB_HEAD_REF` and exits non-zero on a violation. Use it locally or unit
  test `is_valid_branch_name(...)` directly:

  ```bash
  python .github/scripts/check_branch_name.py feature/ABC-123-add-widget   # exit 0
  python .github/scripts/check_branch_name.py random-branch                # exit 1
  ```

---

## Keel's own CI (`ci.yml`)

This repository is itself software and is tested on every push/PR:

1. **lint+typecheck** the `keel` engine and `hub` (ruff / black / mypy),
2. **pytest** the engine's unit + property tests (`keel/tests`),
3. **blueprint is software** (whitepaper §5.4): render `blueprints/python-service`
   through the engine factory into a throwaway repo and assert that the generated
   repo's `pytest` is green. A blueprint that cannot produce a green repo is a
   failing build.
