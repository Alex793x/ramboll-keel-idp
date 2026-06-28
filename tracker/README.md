# tracker/

Per-area live status files written by the fleet agents. Each agent writes **only** its own file
here (`hub.md`, `engine.md`, `blueprint.md`, `ci.md`, `docs.md`) to avoid lost updates under
parallel writes. The orchestrator consolidates these into the top-level `Tracker.md`.
