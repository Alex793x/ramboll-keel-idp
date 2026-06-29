# Getting started

This guide takes you from a clone to your first Keel-born GitHub repository — once through the UI,
once through the CLI.

## 1. Prerequisites

| Tool | Why |
| --- | --- |
| **Rust** (stable toolchain) | Builds and runs the engine workspace (`crates/`). |
| **Node** | Runs the TanStack Start hub (`hub/`). |
| **GitHub CLI `gh`** | The real-repo path creates repos through your authenticated `gh`. Authenticate with the `repo` + `workflow` scopes. |
| **git** | Used by `GhCliProvider` to init/commit/push. |

Check your `gh` auth:

```bash
gh auth status        # must show repo + workflow scopes
```

## 2. Run the test suites

Everything is test-driven, so the fastest sanity check is to run the tests:

```bash
cargo test --workspace        # Rust engine — TDD + proptest, all crates
cd hub && npm install && npm test   # Hub — Vitest + fast-check property tests
```

## 3. Run the stack

Start the Rust API and the hub in two terminals:

```bash
# Terminal 1 — the axum API (defaults to http://localhost:8787)
cargo run -p keel-api

# Terminal 2 — the hub (reads VITE_KEEL_API_URL, defaults to http://localhost:8787)
cd hub && npm run dev
```

## 4. Create your first repo — via the UI

1. Open the hub and **sign in** with any `@ramboll.com` email (the MVP SSO is mocked).
2. Open the **New project** wizard:
   1. **Select a department** — Buildings, Transport, Water, Energy, Environment & Health, or
      Platform Engineering.
   2. **Select the owning users** — multi-select; these become CODEOWNERS alongside the department
      team. (Changing the department resets the user selection.)
   3. **Project details** — a name matching `^[a-z][a-z0-9-]{2,40}$`, a service kind
      (`rest-api` or `worker`), and a one-sentence description.
   4. **Submit.**
3. Watch the **8 steps** run live (`signin → form → render → create_repo → commit → branches →
   seed_ci → register`) and follow the link to your new repository.

## 5. Create your first repo — via the CLI

The CLI runs the identical workflow headlessly. It is the deterministic E2E entry point.

```bash
cargo run -p keel-cli -- init \
  --project demo-svc \
  --department water \
  --users u-sofia,u-tomas \
  --service-kind rest-api \
  --description "Sensor ingestion service for the Water division." \
  --author "Alex Holmberg <axth@syncable.dev>"
```

### Flags

| Flag | Effect |
| --- | --- |
| `--owner <login>` | GitHub account/org for the new repo (default `Alex793x`). |
| `--dry-run` | Use the in-memory `FakeProvider` — renders and records, creates **no** real repo. Ideal for a safe smoke test. |
| `--local <dir>` | Materialize the rendered tree into a local directory instead of GitHub. |

A safe first run that touches nothing remote:

```bash
cargo run -p keel-cli -- init \
  --project demo-svc --department water --users u-sofia,u-tomas \
  --service-kind rest-api --description "Demo." --author "You" --dry-run
```

### Department and user IDs

The mocked departments and users are the single source shared by the API and the hub. Department
IDs: `buildings`, `transport`, `water`, `energy`, `environment-health`, `platform-engineering`.
User IDs look like `u-sofia`, `u-tomas`, `u-alex`. (`u-alex` maps to the real test login `Alex793x`,
so CODEOWNERS always references a valid owner.)

## 6. What you get

See [What a generated repository contains](../README.md#what-a-generated-repository-contains) — a
Python golden-path tree, README + architecture.md, a MkDocs site, three AI skills, three GitHub
Actions referencing reusable workflows, `main`/`dev`/`staging`, and CODEOWNERS from your selection.

Next: [Blueprints](blueprints.md) · [Governance](governance.md).
