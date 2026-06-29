# Runbook

Operational reference for running, monitoring, and recovering this service.
Keep it current — a runbook is only useful if it is trusted.

## Overview

- **Purpose:** see `docs/index.md` and `architecture.md`.
- **Owner:** the owning team (see `CODEOWNERS`).
- **On-call / contact:** the owning team's channel.

## Run locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"          # add ",api" for a rest-api service
pytest                            # smoke + property tests
```

For a `rest-api` service:

```bash
pip install -e ".[api]"
uvicorn <package>.api:app --reload
# Health check:
curl localhost:8000/health
```

## Health & readiness

- `rest-api` services expose `GET /health` returning `{"status": "ok", ...}`.
- A healthy response is HTTP `200` with `status == "ok"`.

## Deploy

- Deployment is driven by the platform CI/CD; merges to `main` are the release path.
- CI **Build / Test / Validate** must be green before merge (enforced by branch protection).

## Monitoring & alerts

- Logs: emitted to stdout/stderr (collected by the platform log pipeline).
- Metrics / traces: per the platform observability standard.
- Add an alert for: elevated error rate, failed health checks, and latency SLO breaches.

## Common operations

### Restart the service
Roll the deployment via the platform tooling. The service is stateless unless
documented otherwise in `architecture.md`.

### Roll back
Re-deploy the previous known-good tag/commit. Confirm `GET /health` afterwards.

## Incident response

1. Acknowledge the alert; declare severity.
2. Check recent changes (`git log`, CI history) — a recent merge is the usual cause.
3. Reproduce with a minimal input; capture it as a failing test before fixing.
4. Mitigate (roll back if needed), then fix forward on a `hotfix/` branch.
5. Write a short post-incident note and link it from an ADR if a decision changed.

## Troubleshooting

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `ImportError` on start | Missing extras | `pip install -e ".[api,dev]"` |
| `/health` 404 | Worker service (no HTTP) | Expected — workers have no HTTP surface |
| CI Validate fails | Lint/type/format/docs | Run `ruff check`, `black --check .`, `mypy`, `mkdocs build --strict` locally |

## Recovery / backups

- Stateless by default. If the service owns data, document its backup/restore
  procedure here.
