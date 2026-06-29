# 1. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-01-01

## Context

We need to record the architectural decisions made on this project so that the
reasoning behind significant choices is preserved for current and future
maintainers. Decisions made implicitly (in chat, in a PR thread, or in someone's
head) are lost over time and lead to re-litigation and accidental regressions.

This service was generated from the Ramboll Developer Platform (Keel)
`python-service` golden-path blueprint, which establishes a set of baseline
decisions (layout, branching model, CI, docs, testing standards). We want a
lightweight place to capture decisions that *deviate from or extend* those
baselines as the service evolves.

## Decision

We will use **Architecture Decision Records (ADRs)**, as described by Michael
Nygard, to capture significant architecture decisions.

- ADRs live in `docs/adr/` and are numbered sequentially (`0001-...`, `0002-...`).
- Each ADR is a short Markdown file with the sections: **Context**, **Decision**,
  **Consequences**, and a **Status** (Proposed / Accepted / Deprecated /
  Superseded).
- An ADR is immutable once accepted; to change a decision, add a new ADR that
  supersedes the old one (and update the old one's status).

## Consequences

- The rationale behind significant decisions is preserved and discoverable.
- New team members can read the ADR log to understand *why* the system is the way
  it is, not just *what* it is.
- There is a small, ongoing cost: significant decisions must be written down.
  This is intentional and cheap relative to the cost of lost context.
