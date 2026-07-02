---
name: monorepo-selective-ci
description: >-
  The keel.services.json contract and the change-aware CI of this monolith.
  Use whenever adding, renaming, or removing a service, changing dependencies
  between services, touching .github/, libs/, or keel.services.json, or
  reasoning about why CI did (or did not) rebuild a service. Keep the manifest
  in sync with services/, declare honest depends_on edges, and never weaken
  the resolver's safe fallbacks.
---

# Monorepo selective CI

This monolith's CI is **change-aware**: on every push/PR the `detect` job diffs
the change, feeds the paths into the pure resolver
`.github/scripts/detect_services.py` together with `keel.services.json`, and
only the **affected** services rebuild. The always-on `gate` job property-tests
the resolver itself, so the pipeline logic is proven on every run.

## The manifest contract — `keel.services.json`

The engine-generated, machine-readable service index at the repo root:

```json
{
  "version": 1,
  "project": "demo",
  "shared_paths": [".github/", "keel.services.json", "libs/"],
  "services": [
    { "dir": "api", "type": "api", "lang": "python", "name": "Backend API", "depends_on": [] },
    { "dir": "fe",  "type": "fe",  "lang": "react",  "name": "Frontend",    "depends_on": ["api"] }
  ]
}
```

Invariants (CI's `gate` job enforces the first two):

- Every `dir` is **unique** and `services/<dir>/` **exists on disk**.
- Every `depends_on` entry names another service's `dir`.
- `services` order is the build/report order — the resolver preserves it.
- `shared_paths` are **prefixes**; a trailing `/` scopes to a directory.

## The resolution rules (in order)

1. **Empty or unreadable diff** ⇒ **ALL** services rebuild (safe fallback).
2. Any changed path under a `shared_paths` prefix ⇒ **ALL** services rebuild.
3. A path under `services/<dir>/` ⇒ that service is affected.
4. `depends_on` **transitive closure**: if `fe` depends_on `api` and `api` is
   affected, `fe` rebuilds too — dependents of dependents included.
5. Anything else (root README, docs/…) ⇒ **no** service rebuilds; the root
   `gate` job still runs.

Any internal resolver error also degrades to ALL (total function) — a broken
manifest can slow CI down, never silently skip a build.

## How to add a service

1. Create the service directory: `services/<dir>/` with its own toolchain,
   tests, and build files (it must pass its language's CI steps standalone).
2. Add its entry to `keel.services.json` — `dir`, `type` (`fe|api|wk|dp|inf`),
   `lang` (e.g. `python|node|react|go|dotnet|terraform`), human `name`, and
   `depends_on`.
3. Declare `depends_on` **honestly**: list every service whose behaviour this
   one consumes (its API client, shared contract, queue producer, …). A missing
   edge means CI can green-light a change that breaks you. Do not invent edges
   either — every false edge costs a needless rebuild. Keep the graph a DAG.
4. If the new service needs steps for a language `ci.yml` does not dispatch on
   yet, extend the matrix steps in `.github/workflows/ci.yml` (guarded by
   `if: matrix.lang == '<lang>'`, running in `services/${{ matrix.dir }}`).
5. Verify locally before pushing:

```bash
pytest                                   # gate: resolver properties stay green
echo "services/<dir>/x" | python .github/scripts/detect_services.py \
  --manifest keel.services.json --changed -   # your service (+ dependents) listed
```

Renaming/removing a service: update the directory AND the manifest entry AND
every `depends_on` that references the old `dir`, in the same PR.

## Shared paths trigger full rebuilds — use them deliberately

Anything under `.github/` (workflows, the resolver itself), the manifest
`keel.services.json`, and `libs/` (cross-service shared code) rebuilds
**everything** when touched. That is the point: shared infrastructure has an
unbounded blast radius, so CI proves the whole monolith. Consequences:

- Put code used by 2+ services in `libs/`, not copied into each service.
- Batch `.github/` changes; do not mix them into a service PR casually — the
  PR will rebuild every service.
- Adding a new shared root directory? Add its prefix to `shared_paths`.

## Checklist

- [ ] `services/<dir>/` and its `keel.services.json` entry land in the same PR.
- [ ] `depends_on` reflects real runtime/build dependencies (no more, no less).
- [ ] Dry-ran the resolver on my changed paths; the affected set is what I expect.
- [ ] Shared-path changes are intentional and isolated.
- [ ] The `gate` suite (`pytest` at the root) is green.
