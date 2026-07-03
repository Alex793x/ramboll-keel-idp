# Goal — Dynamic, component-based CI/CD actions (Keel)  ✅ DONE

**Shipped:** 16 composites (`.github/actions/{build,test,validate}/<stack>/` + `validate/governance`),
3 dispatcher reusable workflows keyed on `stack`, all 8 service blueprints unified onto the
dispatchers, monolith `ci.yml` refactored to matrix-delegate per changed service. 44 YAML files
validated, Rust blueprint tests green, E2E rendered a polyglot project (python/react/go/terraform)
all pointing at the same dispatcher with distinct stacks. Known follow-up: reusable refs use the
existing `Alex793x/keel` owner convention (same as the pre-existing python refs) — align if the
platform repo is published under a different name.

---


## Problem
The platform's CI is effectively **hard-coded to Python**, and the per-language logic is
**duplicated in three places**:
1. Central reusable workflows (`.github/workflows/reusable-{build,test,validate}.yml`) — **Python only**.
2. Non-Python multi-repo blueprints (`blueprints/services/{api-dotnet,api-node,fe-react,wk-go,inf-terraform}`)
   — each **inlines** its own self-contained pipeline.
3. The monolith `blueprints/monolith-root/.../ci.yml` — inlines a big **per-language conditional block**.

So a new language means editing pipelines in many places, and the "central" workflows only serve Python.

## Goal
One source of truth. Every generated repo points to the **same** entry points; those entry points
**dynamically dispatch** to the right language pipeline based on the service component's language.
Readable folder structure split by phase (build / test / validate). No long procedural action.

## Design (GitHub-Actions-constraint-aware)
Reusable workflows can't live in subfolders and `uses:` can't be interpolated — but **composite
actions can live in subfolders**. So:

```
.github/
  workflows/
    reusable-build.yml      # entry point every repo calls; input: stack; dispatches
    reusable-test.yml
    reusable-validate.yml
  actions/
    build/{python,dotnet,node,go,terraform}/action.yml     # the real pipeline logic, per stack
    test/{python,dotnet,node,go,terraform}/action.yml
    validate/{python,dotnet,node,go,terraform,governance}/action.yml
```

- **Stack key** = the service's `lang` (python | dotnet | node | react | go | terraform). `react`
  maps to the `node` stack (identical npm toolchain) via the dispatcher; the other five map 1:1.
- **Dispatcher** (each reusable workflow): a short declarative routing table of conditional
  `uses:` steps → the matching composite. Job name stays `build`/`test`/`validate` (branch-protection
  contract). Accepts `working-directory` (default `.`) so the monolith can target `services/<dir>/`.
- **Composites** hold the actual setup + commands (extracted verbatim from today's pipelines so
  generated repos stay green). Each takes `working-directory`.
- **Branch-name governance** becomes a shared `validate/governance` composite run for **every**
  stack (today only Python enforces it) — a uniform standards-as-code win.
- **Every service blueprint's** `build/test/validate.yml` collapses to a uniform 3-line caller:
  `uses: …/reusable-build.yml@main` with `with: { stack: <lang> }`.
- **Monolith `ci.yml`**: the `services` matrix job replaces its inlined per-language block with the
  same composites (`working-directory: services/${{ matrix.dir }}`), keeping smart selective CI.

## Backward compatibility
`reusable-*.yml` keeps accepting the old `python-version` input (ignored) and defaults `stack` to
`python`, so already-generated repos don't hard-error on their next run.

## Definition of done
- 5 stacks × 3 phases composites + governance; 3 dispatcher workflows; all 8 service blueprints and
  the monolith unified onto the dispatchers.
- Rust blueprint tests still green (rendered workflows valid + green-from-birth).
- E2E: render a multi-language project, show each service's workflow pointing at the shared entry
  point with its stack; confirm the dispatcher routes correctly.
- Pushed to main.
