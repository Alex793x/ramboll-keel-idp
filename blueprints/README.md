# `blueprints/` — the Keel blueprint catalog

Two kinds of blueprint live here. They are not variants of one thing; each is used by a different
engine path. This is the map.

| Directory | Kind | Used when | Rendered by |
| --- | --- | --- | --- |
| `services/` | **Service building blocks** — one dir per `{type}-{lang}` | Any project (a plain init defaults to a single `api:python`; the wizard/CLI can pick more). | `keel-engine` **multi** + **mono** paths |
| `monolith-root/` | **Monolith base** — the repo root a monolith is composed into | You pick components **and** `--layout monolith`. | `keel-engine` **mono** path |

> **There is no separate `python-service` blueprint.** It was retired — the old "single Python
> service" is now just a one-service project built from `services/api-python`. A bare init
> (`keel-cli init …` with no `--services`) defaults to a single service derived from `--service-kind`:
> `rest-api → api:python`, `worker → wk:python`, and produces one repo named `<project>-api` /
> `<project>-wk`.

## `services/<type>-<lang>/` — the building blocks

One blueprint per **service component**, named `{type}-{lang}` and resolved by the engine as
`blueprints/services/{type}-{lang}`:

```
services/
├── api-python/  api-node/  api-dotnet/   # Backend API   (type "api")
├── wk-python/   wk-go/                    # Worker        (type "wk")
├── dp-python/                            # Data pipeline  (type "dp")
├── fe-react/                            # Frontend        (type "fe")
└── inf-terraform/                       # Infrastructure  (type "inf")
```

- **Multi-repo** layout (default) → each selected service is rendered into **its own repo**
  (`<project>-<type>`; ordinal-suffixed when a type repeats, e.g. `-api-1`, `-api-2`).
- **Monolith** layout → each is composed into the monolith under `services/<dir>/`.

`GET /api/service-catalog` reports a `{type,lang}` as `available: true` iff its directory exists here.
`GET /api/blueprints` lists every blueprint (the service building blocks + `monolith-root`).

## `monolith-root/` — the monolith base

When `layout = monolith`, this is rendered as the **repo root** (README, docs, CODEOWNERS, and the
**smart selective-CI** pipeline: `detect_services.py` + `.github/workflows/ci.yml`). The engine then
composes the chosen `services/*` into `services/<dir>/`, writes `keel.services.json` (the CI
manifest), and commits one repo.
