# `blueprints/` — the Keel blueprint catalog

Three **different kinds** of blueprint live here. They are not variants of one thing; each is used
by a different engine path. This is the map.

| Directory | Kind | Used when | Rendered by |
| --- | --- | --- | --- |
| `python-service/` | **Legacy single-service default** (v1/v2 golden path) | You initialize **without** picking service components (`--blueprint python-service`, no `--services`). | `keel-engine` **legacy** path |
| `services/` | **v3 service building blocks** — one dir per `{type}-{lang}` | You pick service components (`--services api:python,fe:react`). | `keel-engine` **multi** + **mono** paths |
| `monolith-root/` | **v3 monolith base** — the repo root a monolith is composed into | You pick components **and** `--layout monolith`. | `keel-engine` **mono** path |

## 1. `python-service/` — the legacy default

The original golden path: pick nothing special and you get one Python repo. The engine resolves it
as `blueprints/<--blueprint>` (default `python-service`). Kept for backward-compatibility so the v2
single-service flow is byte-identical.

## 2. `services/<type>-<lang>/` — v3 building blocks

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

- **Multi-repo** layout → each selected service is rendered into **its own repo** (`<project>-<type>`).
- **Monolith** layout → each is composed into the monolith under `services/<dir>/`.

`GET /api/service-catalog` reports a `{type,lang}` as `available: true` iff its directory exists here.

## 3. `monolith-root/` — the monolith base

When `layout = monolith`, this is rendered as the **repo root** (README, docs, CODEOWNERS, and the
**smart selective-CI** pipeline: `detect_services.py` + `.github/workflows/ci.yml`). The engine then
composes the chosen `services/*` into `services/<dir>/`, writes `keel.services.json` (the CI
manifest), and commits one repo.

---

### Note on the `python-service` ↔ `services/api-python` overlap

Both are "the Ramboll Python API golden path", so they look redundant. They differ by **role**:
`python-service` is the legacy *default* (used when no components are selected); `services/api-python`
is the v3 *building block* (carries `{{ service.* }}` context + monolith-awareness). Consolidating
them — making `python-service` an alias of `services/api-python`, or retiring it once the wizard
always uses the components model — is a deliberate follow-up, not done here because it changes the
default `--blueprint` and its tests.
