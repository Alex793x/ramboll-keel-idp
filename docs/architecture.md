# Architecture

The authoritative architecture document lives at the repository root:

➡️ **[../architecture.md](../architecture.md)**

It covers, in depth:

- the **three planes** (experience / orchestration / integration) mapped to the crates and hub;
- a **component diagram** and a **sequence diagram** of the 8-step workflow;
- the **`RepoProvider`** dependency inversion (`GhCliProvider` vs `LocalDir` vs `FakeProvider`) and
  why it makes the engine testable;
- **blueprint anatomy** (manifest + template tree + post-actions; the `.j2`-vs-verbatim rule);
- the **catalog / audit JSON** and **blueprint versioning**;
- the **department / users → CODEOWNERS** mapping;
- the **reusable-CI** "fix once, benefit everyone" model;
- **technology choices** and the **documented future** (octocrab + GitHub App, Entra ID OIDC, drift
  detection, self-updating blueprints).

The frozen crate and HTTP contracts are in [../SPEC.md](../SPEC.md) §3.
