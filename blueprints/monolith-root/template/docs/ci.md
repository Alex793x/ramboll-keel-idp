# How the smart CI works

This monolith rebuilds **only what a change affects**. The pipeline
(`.github/workflows/ci.yml`) is three jobs:

```
detect ──► services (matrix over affected services only)
   │            ▲
   └── gate ────┘   (gate always runs; services needs detect + gate)
```

1. **detect** — checks out with full history, computes the changed paths
   (`git diff --name-only` over the PR base or the push range), and runs the
   pure resolver `.github/scripts/detect_services.py` against
   `keel.services.json`. It emits `services` (a JSON array for the matrix)
   and `any` (whether anything is affected).
2. **gate** — always runs, whatever changed: installs the root toolchain and
   runs the Hypothesis property suite in `tests/`, which proves the resolver's
   own rules, plus a manifest sanity check (parses; dirs unique; dirs exist).
   `gate` is the required check on `main`.
3. **services** — a `fail-fast: false` matrix over exactly the affected
   services, dispatching per `lang` inside `services/<dir>/`:
   python ⇒ pytest+ruff+black+mypy · node/react ⇒ npm ci+test+build ·
   go ⇒ vet+test+build · dotnet ⇒ dotnet test · terraform ⇒ fmt+init+validate.
   If nothing is affected, the whole job skips.

## The resolution rules (prefix semantics, in order)

1. **Empty/unreadable diff ⇒ ALL** (reason `fallback`). First push to a branch,
   force-push with an all-zero `before` SHA, or a failed diff all land here —
   the pipeline degrades to a full rebuild, never to a skipped build.
2. **Shared path ⇒ ALL** (reason `shared:<path>`). Any changed path under a
   `shared_paths` prefix (default `.github/`, `keel.services.json`, `libs/`).
3. **`services/<dir>/…` ⇒ that service** — prefix match against manifest dirs.
4. **`depends_on` transitive closure** — dependents of affected services are
   added until a fixed point (B depends_on A, A affected ⇒ B affected).
5. **Anything else ⇒ no service** — root docs never rebuild services; the
   `gate` job still runs.

The resolver is **total**: on any internal error it prints the all-services
result (reason `error-fallback`) and exits 0. It is **deterministic**: output
services are always in manifest order, whatever the input order.

## Worked examples

Assume this manifest:

```json
{ "version": 1, "project": "demo",
  "shared_paths": [".github/", "keel.services.json", "libs/"],
  "services": [
    { "dir": "api", "type": "api", "lang": "python", "name": "Backend API", "depends_on": [] },
    { "dir": "fe",  "type": "fe",  "lang": "react",  "name": "Frontend",    "depends_on": ["api"] },
    { "dir": "wk",  "type": "wk",  "lang": "python", "name": "Worker",      "depends_on": ["api"] }
  ] }
```

| Changed paths | Affected | Why |
| --- | --- | --- |
| `services/wk/tasks.py` | `wk` | Rule 3; nothing depends on `wk`. |
| `services/api/src/app.py` | `api`, `fe`, `wk` | Rule 3 + rule 4: `fe` and `wk` depend on `api`. |
| `.github/workflows/ci.yml` | ALL | Rule 2 — shared prefix `.github/`. |
| `libs/contracts/order.py` | ALL | Rule 2 — shared prefix `libs/`. |
| `README.md`, `docs/ci.md` | none | Rule 5 — `gate` still runs. |
| *(empty diff)* | ALL | Rule 1 — safe fallback. |

## Try it locally

```bash
# What would my working set rebuild?
git diff --name-only dev...HEAD | python .github/scripts/detect_services.py \
  --manifest keel.services.json --changed -

# A one-off experiment:
printf 'services/api/src/app.py\n' | python .github/scripts/detect_services.py \
  --manifest keel.services.json --changed -
```

## Why trust it?

The `gate` job runs `tests/test_detect_services.py` on every push — a
Hypothesis property suite over randomly generated manifests (2–8 services,
random dependency DAGs) proving: monotonicity (more changes never rebuild
fewer services), shared ⇒ all, isolation (changes under one service rebuild
exactly its dependency closure), closure idempotence + transitivity,
determinism under input shuffling, and totality on junk input. The generated
monolith continuously tests its **own** pipeline logic.
