# Keel — Build Tracker

Master execution tracker for the Keel MVP. **Single source of truth for alignment.**
Plan in `SPEC.md`. Each fleet agent owns one area and writes its live status to
`tracker/<area>.md` (never edits this file — prevents lost updates under parallel writes).
The orchestrator consolidates the table below.

**Branch model (also enforced by the product we are building):** `main` / `dev` / `staging`;
working branches `feature/` · `bug/` · `hotfix/`.

---

## Fleet roster & area ownership

| # | Area | Owner agent | Subtree (exclusive) | Status |
| --- | --- | --- | --- | --- |
| A | Hub (experience plane) | Fleet-Hub | `hub/` | ⏳ pending |
| B | Engine (orchestration plane) | Fleet-Engine | `keel/` + root `pyproject.toml` | ⏳ pending |
| C | Python blueprint (golden path) | Fleet-Blueprint | `blueprints/python-service/` | ⏳ pending |
| D | Reusable CI (integration plane) | Fleet-CI | `.github/` | ⏳ pending |
| E | Platform docs | Fleet-Docs | `README.md`, `architecture.md`, `docs/`, `CONTRIBUTING.md`, `SECURITY.md` | ⏳ pending |

Status legend: ⏳ pending · 🔧 in progress · ✅ done · ⚠️ blocked

---

## Milestones

- [x] M0 — Read whitepaper; sample Ramboll brand; `git init`; MemTrace running.
- [x] M1 — Master `SPEC.md` + `Tracker.md` drafted.
- [ ] M2 — First commit (foundation) + `MemTrace start` confirmed + repo indexed.
- [ ] M3 — Fleets dispatched (each: publish intent → build → record episode → write tracker/<area>.md).
- [ ] M4 — All five areas report ✅.
- [ ] M5 — Orchestrator integration pass: generate a sample repo, run its tests green, smoke the Hub.
- [ ] M6 — Final commit; fleet episode recorded; Definition of Done (SPEC §11) satisfied.

---

## Integration contracts (must hold across areas — see SPEC §6)

- **Factory API** `keel.factory.Keel(...).initialize(...)` — Area B exposes, Area A consumes.
- **Manifest schema** `keel/v1` — Area C authors, Area B validates.
- **Reusable CI** `Ramboll-RDP/keel/.github/workflows/reusable-{build,test,validate}.yml@v1` —
  Area D authors, Area C references.
- **Brand tokens** `hub/static/css/tokens.css` from SPEC §9 — Area A.

---

## Live area notes (consolidated from `tracker/<area>.md`)

_Updated by the orchestrator after the fleet reports._

- **A — Hub:** _pending_
- **B — Engine:** _pending_
- **C — Blueprint:** _pending_
- **D — Reusable CI:** _pending_
- **E — Docs:** _pending_

---

## Risk / decisions log

- **D-01** Hub/engine built in **Python (FastAPI)**, not Rust — MVP speed + verifiability +
  Python-first golden path. Rust control plane is a documented later migration. (SPEC §4)
- **D-02** Repo target is a **local git repository**, not GitHub API — no remote; "forking
  irrelevant." GitHub App/octocrab path documented. (SPEC §4)
- **D-03** **Mock login** instead of Entra OIDC — per instruction "skip SSO." (SPEC §4)
- **D-04** Catalog/audit in **SQLite/JSON**, not Postgres — zero-infra MVP. (SPEC §4)
