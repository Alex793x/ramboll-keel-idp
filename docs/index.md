# Keel documentation

> **Bright ideas. Sustainable change.**

**Keel** is the project-initialization layer of the **Ramboll Developer Platform (RDP)**. An
engineer signs in, selects a department and the owning users, picks the Python golden-path
blueprint, and — in minutes — gets a **real GitHub repository** that is standards-compliant and
**green from its first commit**.

In shipbuilding, *laying the keel* is the formal start of construction — the structural backbone the
whole vessel is built on. Keel does the same for a software project: it paves the first and most
important stretch of the golden path, the creation of the project itself.

## Why it exists

The moment a project is created is the single highest-leverage point in its lifecycle, and today it
is almost entirely unmanaged. Keel attacks three problems (whitepaper §1):

- **The cold-start tax** — days of undifferentiated setup before any business logic.
- **Configuration drift** — every hand-scaffolded repo is subtly different.
- **Standards in prose, not code** — wiki standards nobody reads at the moment they matter.

The cheapest, most durable place to enforce a standard is **at initialization, by construction**, so
compliance is the default and divergence is the deliberate, visible exception.

## Read next

| Page | What it covers |
| --- | --- |
| [Getting started](getting-started.md) | Install Rust + Node, run the stack, create your first repo via the UI and the CLI. |
| [Architecture](architecture.md) | The v2 architecture — three planes, six crates, the 8-step workflow. |
| [Blueprints](blueprints.md) | How blueprints work, the manifest, how to add one, the three skills. |
| [Governance](governance.md) | The branch model, the three AI skills, CI gates, no ad-hoc config. |
| [Roadmap](roadmap.md) | The whitepaper's phased roadmap. |

See also the root [README.md](../README.md), the full [architecture.md](../architecture.md), the
binding contract in [SPEC.md](../SPEC.md), and the build [Tracker.md](../Tracker.md).
