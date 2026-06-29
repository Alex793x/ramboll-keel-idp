# Keel CI — Keel's own pipeline + the reusable library for generated repos

This directory does **two** jobs for the Ramboll Developer Platform (RDP):

1. **Keel's own v2 CI** (`workflows/ci.yml`) — tests *this* repo: a **Rust** Cargo
   workspace engine (`crates/keel-*`) and a **TanStack Start** hub (`hub/`).
2. **A reusable CI library** (`workflows/reusable-*.yml` + `actions/setup-python-env`)
   — the central pipelines that **every blueprint-generated Python repo** points to.

> **The point of the reusable half:** avoid pipeline copy-paste. A generated repo
> ships tiny caller workflows that delegate to the reusable workflows here. **Fix
> the build, test, or validate logic once and every existing and future generated
> repo inherits the change** — no per-repo edits, no drift.

---

## Layout

```
.github/
├── actions/
│   └── setup-python-env/action.yml   # composite action — shared building block (generated repos)
├── scripts/
│   └── check_branch_name.py          # standalone, unit-testable branch-name rule
└── workflows/
    ├── ci.yml                        # Keel's OWN v2 CI: rust + hub + blueprint-is-software
    ├── reusable-build.yml            # on: workflow_call — build & import check  (generated repos)
    ├── reusable-test.yml             # on: workflow_call — pytest (smoke + property) (generated repos)
    └── reusable-validate.yml         # on: workflow_call — lint/format/types/governance/docs (generated repos)
```

---

## Part 1 — Keel's own CI (`ci.yml`)

v2 Keel is a Rust engine plus a TypeScript hub, so its CI is **not** the Python
pipeline anymore. It runs on `push` to `main` / `dev` / `staging` and on every
`pull_request`, with three jobs:

| Job | Runs | Proves |
| --- | --- | --- |
| **rust** | `dtolnay/rust-toolchain@stable` (+ rustfmt, clippy); `cargo fmt --all --check`; `cargo clippy --workspace --all-targets -- -D warnings`; `cargo test --workspace` | the `keel-*` crates are formatted, lint-clean (warnings denied), and pass the unit + `proptest` suite |
| **hub** | `actions/setup-node@v4` (Node 22); `cd hub && npm ci && npm test && npm run build` | the TanStack Start hub installs cleanly, its Vitest (+ `fast-check`) suite is green, and it builds |
| **blueprint-is-software** | build `keel-cli`, render the `python-service` blueprint **locally** to `$RUNNER_TEMP/out`, then in the generated repo `pip install -e ".[dev,api]"` and run `pytest && ruff check . && black --check . && mypy .` | whitepaper §5.4: a blueprint that cannot produce a **green-from-birth** repo is a failing build |

### The "blueprint is software" job in detail

This realises the whitepaper §5.4 principle that blueprints are software and are
tested in CI. Rather than reaching out to GitHub, it uses the **local provider**
to render the golden-path blueprint straight to disk, then runs the generated
repo's own quality gate:

```bash
cargo build -p keel-cli
cargo run -p keel-cli -- init \
  --project ci-check \
  --department platform-engineering \
  --users u-alex \
  --service-kind rest-api \
  --description "CI render check" \
  --author ci \
  --local "$RUNNER_TEMP/out"
# then, inside $RUNNER_TEMP/out/ci-check:
pip install -e ".[dev,api]" && pytest && ruff check . && black --check . && mypy .
```

> **Contract note (`--local`).** The local-render flag is named `--local <dir>`
> per the Fleet-CI assignment; the binding contract is SPEC §3.6. As of this
> writing `crates/keel-cli` is still a Phase-0 stub (Fleet-Api-RS owns the `init`
> command). If Fleet-Api-RS lands a different name or shape for local rendering,
> update the single `cargo run -p keel-cli -- init …` invocation in `ci.yml`
> (and the note in `tracker/ci.md`). Nothing else in this job depends on it.

The blueprint's `[dev,api]` extras (`pytest`, `hypothesis`, `ruff`, `black`,
`mypy`, `mkdocs-material`, plus `fastapi` / `uvicorn` for the REST surface) come
from `blueprints/python-service/template/pyproject.toml.j2`, so the four gate
commands have all their tooling. The blueprint targets `>=3.11`; CI pins 3.12.

---

## Part 2 — the reusable library for generated Python repos

The `reusable-*.yml` workflows and the `setup-python-env` composite action are a
**separate product** from Keel's own CI. They are **not** invoked by `ci.yml`;
they exist so that each generated repo carries only a thin caller and inherits
all real logic from here.

### The reusable workflow contract

Generated repos call these by **path + ref**. The owner/repo is `Alex793x/keel`
and the ref is the moving `@main` branch (per SPEC §6 + the Tracker integration
contracts; the blueprint agent owns and updates the caller refs):

| Reusable workflow | `on: workflow_call` inputs | What it does |
| --- | --- | --- |
| `reusable-build.yml`    | `python-version` (default `"3.12"`) | setup env (composite), `pip install .`, `compileall` import check, `python -m build` if available |
| `reusable-test.yml`     | `python-version` (default `"3.12"`) | setup env (composite), `pytest -q` (smoke + Hypothesis property tests) |
| `reusable-validate.yml` | `python-version` (default `"3.12"`) | setup env (composite), `ruff check`, `black --check`, `mypy`, branch-name governance, `mkdocs build --strict` (if `mkdocs.yml`) |

These three **filenames** and the single `workflow_call` input **`python-version`**
are the frozen API contract: the blueprint generates caller workflows against
exactly these signatures. Do not rename them or change the input shape without
coordinating with Fleet-Blueprint-PY (which writes the caller refs).

### How a generated repo references them

Each generated repo ships three thin caller workflows under its own
`.github/workflows/`. For example, `build.yml`:

```yaml
# build.yml (inside a generated repo)
on:
  push:
    branches: [main, dev, staging]
  pull_request: {}
jobs:
  build:
    uses: Alex793x/keel/.github/workflows/reusable-build.yml@main
    with:
      python-version: "3.12"
```

`test.yml` and `validate.yml` are identical in shape, pointing at
`reusable-test.yml@main` and `reusable-validate.yml@main` respectively. That is
the whole pipeline a generated repo carries — all real logic lives here.

### Why it is modular: the composite action

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
generated pipeline at once. This is the concrete realisation of the "fix once,
benefit everyone" requirement.

---

## Branch-name governance

The branch model is `main` / `dev` / `staging` with working branches
`feature/` · `bug/` · `hotfix/`. It is enforced in two complementary places:

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
