# Keel CI composite actions

Language-aware CI, split by **phase** then **stack**, so a generated repo's `build.yml` /
`test.yml` / `validate.yml` all point at the *same* reusable dispatcher and the dispatcher runs the
right pipeline for the service's language.

```
.github/
  workflows/
    reusable-build.yml      # dispatcher: input `stack` → build/<stack>
    reusable-test.yml       # dispatcher: input `stack` → test/<stack>
    reusable-validate.yml   # dispatcher: governance (all stacks) → validate/<stack>
  actions/
    build/{python,dotnet,node,go,terraform}/      # the real build logic, one per stack
    test/{python,dotnet,node,go,terraform}/       # the real test logic
    validate/{python,dotnet,node,go,terraform}/   # the real validate logic
    validate/governance/                          # shared branch-name policy (every stack)
```

## How dispatch works
`uses:` cannot be interpolated and reusable workflows cannot live in subfolders — but **composite
actions can**. So each dispatcher is a short declarative routing table of conditional `uses:` steps
that select the matching composite. A generated repo always references the dispatcher:

```yaml
# build.yml in any generated repo — identical everywhere except the stack value
jobs:
  build:
    uses: Alex793x/keel/.github/workflows/reusable-build.yml@main
    with:
      stack: dotnet   # python | dotnet | node | react | go | terraform  (react → node stack)
```

Every composite takes `working-directory` (default `.`) so the **monolith** `ci.yml` reuses the
exact same dispatchers per changed service (`working-directory: services/<dir>`), with no inline
per-language steps.

## Adding a language
1. Add `build/<stack>/`, `test/<stack>/`, `validate/<stack>/` composites.
2. Add one `if: inputs.stack == '<stack>'` route to each of the three dispatchers.
3. Point the new service blueprint's three workflows at the dispatchers with `stack: <stack>`.
