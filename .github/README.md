# Keel CI — Keel's own pipeline + the reusable library for generated repos

This directory does **two** jobs for the Ramboll Developer Platform (RDP):

1. **Keel's own v2 CI** (`workflows/ci.yml`) — tests *this* repo: a **Rust** Cargo
   workspace engine (`crates/keel-*`) and a **TanStack Start** hub (`hub/`).
2. **A reusable CI library** (`workflows/reusable-*.yml`) — the central, **self-contained**
   pipelines that **every blueprint-generated Python repo** points to.

> **The point of the reusable half:** avoid pipeline copy-paste. A generated repo
> ships tiny caller workflows that delegate to the reusable workflows here. **Fix
> the build, test, or validate logic once and every existing and future generated
> repo inherits the change** — no per-repo edits, no drift.

---

## Layout

```
.github/
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
| **blueprint-is-software** | build `keel-cli`, render the Python golden path (`services/api-python`, the default for a bare init) **locally** to `$RUNNER_TEMP/out`, then in the generated repo `pip install -e ".[dev,api]"` and run `pytest && ruff check . && black --check . && mypy .` | whitepaper §5.4: a blueprint that cannot produce a **green-from-birth** repo is a failing build |

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
# a bare init defaults to a single api:python service → repo "ci-check-api";
# then, inside $RUNNER_TEMP/out/ci-check-api:
pip install -e ".[dev,api]" && pytest && ruff check . && black --check . && mypy .
```

> **`--local <dir>`** writes the rendered repo to disk with no GitHub/`gh` (SPEC §3.6).

The blueprint's `[dev,api]` extras (`pytest`, `hypothesis`, `ruff`, `black`,
`mypy`, `mkdocs-material`, plus `fastapi` / `uvicorn` for the REST surface) come
from `blueprints/services/api-python/template/pyproject.toml.j2`, so the four gate
commands have all their tooling. The blueprint targets `>=3.11`; CI pins 3.12.

---

## Part 2 — the reusable library for generated Python repos

The `reusable-*.yml` workflows are a **separate product** from Keel's own CI. They
are **not** invoked by `ci.yml`; they exist so that each generated repo carries
only a thin caller and inherits all real logic from here.

### The reusable workflow contract

Generated repos call these by **path + ref**. For the MVP the owner/repo is
`Alex793x/keel` at the moving `@main` ref (the test account authorised for this
build). **Production note:** move these to a Ramboll org and pin a version tag
(e.g. `uses: Ramboll-RDP/keel/.github/workflows/reusable-build.yml@v1`) so generated
repos depend on an org-owned, deliberately-versioned pipeline rather than one
person's `@main`. This is tracked as a decision in `Tracker.md` (D-07).

| Reusable workflow | `on: workflow_call` inputs | What it does |
| --- | --- | --- |
| `reusable-build.yml`    | `python-version` (default `"3.12"`) | set up Python (inlined), `pip install .`, `compileall` import check, `python -m build` if available |
| `reusable-test.yml`     | `python-version` (default `"3.12"`) | set up Python (inlined), `pytest -q` (smoke + Hypothesis property tests) |
| `reusable-validate.yml` | `python-version` (default `"3.12"`) | set up Python (inlined), `ruff check`, `black --check`, `mypy`, branch-name governance, `mkdocs build --strict` (if `mkdocs.yml`) |

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

### Why it is modular — and why setup is inlined (not a composite action)

The **reusable workflow itself** is the unit of reuse: a generated repo references
`reusable-build/test/validate.yml@<ref>`, so editing the logic here updates **every**
generated pipeline at once — the "fix once, benefit everyone" requirement.

An earlier version factored the Python setup into a local composite action that the
three workflows called via `uses: ./.github/actions/setup-python-env`. **That is a
trap for reusable workflows:** when a *remote* repo calls a reusable workflow, a
`./`-relative action path resolves against the **caller's** checkout — which does not
ship our composite — so every generated repo's CI failed to load before any step ran.
The setup steps are therefore **inlined** into each reusable workflow, keeping them
fully self-contained for remote callers. The reusable workflows remain the single
shared edit point.

---

## Branch-name governance

The branch model is `main` / `dev` / `staging` with working branches
`feature/` · `bug/` · `hotfix/`. The rule: a PR head ref must match
`^(feature|bug|hotfix)/.+$` (a non-empty descriptor after the prefix) or be one of
the protected branches `main` / `dev` / `staging`.

It is enforced **inline** in `reusable-validate.yml`: on `pull_request`, the head
ref is checked against that rule and the job fails otherwise. The check is inlined
(a bash regex, not a call to a shared script) for the same remote-resolution reason
as the setup steps above — a generated repo calls this workflow from its **own**
checkout, which does not ship Keel's scripts, so a `./`-relative script path would
not resolve. Inlining keeps the gate self-contained for every remote caller, while
`reusable-validate.yml` stays the single shared edit point for the rule.
