# Area 7 — Reusable + Keel CI (`.github/`)

**Owner:** Fleet-CI · **Exclusive subtree:** `.github/` only · **Status:** ✅ done

Rewrote Keel's *own* CI for v2 (Rust engine + TanStack hub) while **keeping** the
v1-retained reusable workflows + composite action that serve generated Python
repos. SPEC refs: §2 (architecture), §3.6 (CLI `--local`), §5 (E2E), §6
(ownership/contracts), §7 (TDD), §9 (MemTrace), whitepaper §5.4.

---

## 1. `workflows/ci.yml` — Keel's own v2 CI (rewritten)

Triggers: `push` → `[main, dev, staging]` + `pull_request`. `permissions: contents: read`.
Added `concurrency` (cancel-in-progress on the same ref). Three jobs:

| Job | Steps |
| --- | --- |
| **rust** | `actions/checkout@v4`; `dtolnay/rust-toolchain@stable` with `components: rustfmt, clippy`; cargo cache; `cargo fmt --all --check`; `cargo clippy --workspace --all-targets -- -D warnings`; `cargo test --workspace` |
| **hub** | `actions/checkout@v4`; `actions/setup-node@v4` (`node-version: "22"`, npm cache on `hub/package-lock.json`); `cd hub` → `npm ci` → `npm test` → `npm run build` |
| **blueprint-is-software** | build `cargo build -p keel-cli`; render python-service blueprint **locally** via `cargo run -p keel-cli -- init … --local "$RUNNER_TEMP/out"`; `actions/setup-python@v5` (3.12); in `$RUNNER_TEMP/out/ci-check` → `pip install -e ".[dev,api]"` → `pytest` → `ruff check .` → `black --check .` → `mypy .` |

This replaces the old v1 `ci.yml` (which invoked the Python `keel.factory.Keel`
engine + Python `keel`/`hub` lint/test). The v1 engine is gone in v2 (SPEC §1).

### `--local` contract note (SPEC §3.6) — IMPORTANT for integration

- The assignment specifies `--local "$RUNNER_TEMP/out"` for headless local
  rendering (no `gh`, no GitHub). That is what `ci.yml` calls.
- **As of this writing `crates/keel-cli/src/main.rs` is still a Phase-0 stub** —
  Fleet-Api-RS owns the `init` command and has not implemented it yet. SPEC §3.6
  documents `init --project --department --users --service-kind --description
  --author [--owner Alex793x] [--dry-run]` but does **not yet list `--local`**.
- **Action for Fleet-Api-RS / orchestrator:** when `init` lands, confirm the
  local-render flag is `--local <dir>`. If the final flag name/shape differs,
  update the single `cargo run -p keel-cli -- init …` invocation in `ci.yml`
  (and this note). Nothing else in the job depends on it.
- Blueprint extras line up: `blueprints/python-service/template/pyproject.toml.j2`
  defines `[dev]` (pytest, hypothesis, ruff, black, mypy, mkdocs-material) and
  `[api]` (fastapi, uvicorn), so `pip install -e ".[dev,api]"` + the four gate
  commands all resolve. Blueprint `requires-python = ">=3.11"`; CI pins 3.12. ✅

---

## 2. Reusable workflows for generated Python repos (kept)

Kept verbatim (logic unchanged) — they are the separate "fix once, inherit
everywhere" product:

- `workflows/reusable-build.yml` — `on: workflow_call`, input `python-version`
  (default `"3.12"`): setup env (composite) → `pip install .` → `compileall` →
  `python -m build` if available.
- `workflows/reusable-test.yml` — `on: workflow_call`, input `python-version`:
  setup env → `pytest -q`.
- `workflows/reusable-validate.yml` — `on: workflow_call`, input `python-version`:
  setup env → `ruff check` → `black --check` → `mypy` → branch-name governance
  (PR only) → `mkdocs build --strict` (if `mkdocs.yml`).
- `actions/setup-python-env/action.yml` — composite: `actions/setup-python@v5`
  (pip cache) → upgrade pip → generic `pip install ".[dev]"`/`.` if packaging
  metadata → install `ruff black mypy pytest hypothesis`. All three reusable
  workflows reference it via `uses: ./.github/actions/setup-python-env`. ✅

### Contract verification vs. the generated-repo refs

Generated repos reference `Alex793x/keel/.github/workflows/reusable-*.yml@main`
(SPEC §6, Tracker integration contracts; Fleet-Blueprint-PY owns the caller refs).

- Filenames `reusable-{build,test,validate}.yml` — **MATCH**. ✅
- `workflow_call` input `python-version` (default `"3.12"`) — **MATCH**. ✅
- Updated the header-comment `uses:` examples in all three reusable workflows
  from the stale `Ramboll-RDP/keel/...@v1` to the correct
  `Alex793x/keel/...@main`, and flagged filename + `python-version` as the frozen
  part of the contract. (Comment-only; no behavioural change.)

---

## 3. Branch-name governance (kept)

`scripts/check_branch_name.py` unchanged — allows `feature/`, `bug/`, `hotfix/`
working branches + `main`/`dev`/`staging`. Verified working (below).

---

## 4. `README.md` (rewritten)

Now explains both halves: (a) Keel's v2 CI (`rust` + `hub` +
`blueprint-is-software` jobs, with the `--local` render walkthrough + contract
note); (b) the reusable model for generated Python repos with corrected
`Alex793x/keel/...@main` caller refs and the composite-action rationale.

---

## Verification (read-only / safe — `act` NOT run)

- **YAML parse** — `python -c "import yaml,glob;[yaml.safe_load(open(f)) for f in
  glob.glob('.github/**/*.yml',recursive=True)]"` → all **5** files parse:
  `ci.yml`, `reusable-build.yml`, `reusable-test.yml`, `reusable-validate.yml`,
  `actions/setup-python-env/action.yml`. ✅
  (Note: PyYAML maps `on:` → boolean key per YAML 1.1; harmless, GitHub parses
  it correctly.)
- **Branch governance** —
  `python .github/scripts/check_branch_name.py feature/ABC-1-x` → "valid", exit 0 ✅
  `python .github/scripts/check_branch_name.py bogus-name` → violation, exit 1 ✅

---

## MemTrace

- START: `fleet_publish_intent` repo_id `keel`, agent_id `fleet-ci`, branch
  `main`, assignment "Keel v2 CI (Rust+hub) + keep reusable workflows", touched
  `[".github::ci",".github::reusable"]`, intent `{"feature":{"surface":"module"}}`
  → intent_id `01KW8C5ZF62JCVDBXPV1NDQGEG`, no active conflicts ("clear"). ✅
- END: `fleet_record_episode` recorded (see summary). ✅

---

## Files touched (`.github/` only)

- `workflows/ci.yml` — rewritten (v2 Rust + hub + blueprint-is-software).
- `workflows/reusable-build.yml` — header comment → `Alex793x/keel/...@main`.
- `workflows/reusable-test.yml` — header comment → `Alex793x/keel/...@main`.
- `workflows/reusable-validate.yml` — header comment → `Alex793x/keel/...@main`.
- `README.md` — rewritten for v2.
- (kept unchanged: `actions/setup-python-env/action.yml`, `scripts/check_branch_name.py`)
