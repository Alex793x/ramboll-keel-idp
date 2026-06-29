# Keel — Ramboll Developer Platform

> **Bright ideas. Sustainable change.**
>
> **Keel** is the project-initialization layer of the Ramboll Developer Platform (RDP).
> A self-service **Hub** where an engineer signs in, **selects a department and the owning users**,
> picks the Python blueprint, and gets a **real, standards-compliant GitHub repository** — green
> from its first commit.

**v2 architecture:** a Rust Cargo-workspace **engine** (`crates/`) behind a **TanStack Start** hub
(`hub/`), creating repositories via the `gh` CLI, from the Python golden-path **blueprint**
(`blueprints/python-service/`) wired to **reusable GitHub Actions** (`.github/`).

- **[SPEC.md](SPEC.md)** — master specification & frozen crate/API contracts.
- **[Tracker.md](Tracker.md)** — execution tracker & area ownership.
- **`keel_whitepaper.pdf`** — the source vision.

```bash
cargo test --workspace        # Rust engine: TDD + proptest
cd hub && npm test            # Hub: Vitest + fast-check
```

> 🚧 _v2 build in progress — this README is expanded by the platform-docs area._
