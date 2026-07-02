# Tracker — Fleet-Blueprints-V3 (`blueprints/services/`)

**Assignment:** 8 early service blueprints (SPEC §14). **Status: COMPLETE.**
Agent: `fleet-blueprints-v3` · Subtree: `blueprints/services/` (exclusive) · Date: 2026-07-02

## Per-blueprint status

| Blueprint | Combo | Stack | Working module | Property tests | Verification |
| --- | --- | --- | --- | --- | --- |
| `api-python` | `api:python` | Python 3.11+, FastAPI extra | `core.py` (slugify/normalize/word_count) + `api.py` /health | Hypothesis ×8 | **local-green ✓** (12 pytest · ruff · black · mypy strict) |
| `wk-python` | `wk:python` | Python 3.11+, no HTTP | `worker.py` (backoff, batching) + `__main__` shell | Hypothesis ×8 | **local-green ✓** (14 pytest · ruff · black · mypy · `python -m` runs) |
| `dp-python` | `dp:python` | Python 3.11+ | `pipeline.py` (records→normalized, partition) | Hypothesis ×10 | **local-green ✓** (16 pytest · ruff · black · mypy strict) |
| `fe-react` | `fe:react` | Vite 7 + React 19.2.7 + TS 5.9.3 | `App.tsx` + pure `lib/classNames.ts` | fast-check ×3 + oracle | **local-green ✓** (7 Vitest · tsc --noEmit · vite build) |
| `api-node` | `api:node` | Node 22 + TS, `node:http`, **zero runtime deps** | pure `routes.ts` + `server.ts` shell | fast-check ×5 | **local-green ✓** (10 Vitest · tsc · build · live /health=200, 405, 404) |
| `api-dotnet` | `api:dotnet` | .NET 8 minimal API, xUnit 2.9.2 | pure `StatusInfo` + `Program.cs` wiring | xUnit Theory tables ×5 | **authored + CI-pending** (no dotnet SDK locally; csproj XML well-formed, C# brace/paren balanced, nullable+warnaserror set) |
| `wk-go` | `wk:go` | Go 1.22, no HTTP | pure `worker` pkg (Backoff/Schedule) + `main.go` shell | table tests + `FuzzBackoffMonotonic` | **authored + CI-pending** (no go toolchain locally; gofmt tab-indent verified, brace-balanced, overflow-safe by construction) |
| `inf-terraform` | `inf:terraform` | Terraform ≥1.7, azurerm ~>4.0 | naming local + tagged resource group | variable validations (+ `infra-invariants` skill) | **authored + CI-pending** (no terraform locally; fmt-style verified: 2-space indent, per-level `=` alignment, brace-balanced) |

The 6 remaining combos (vue, blazor, wk-dotnet, dp-dbt, dp-spark, inf-bicep) are intentionally
absent ⇒ the Hub's service catalog shows them dimmed/SOON (SPEC §13/§14).

## Shape (each blueprint)

```
blueprints/services/{name}/
├── blueprint.yaml            keel/v2 manifest + additive `service: {type, language}`
│                             params: project_name/description/author (python-service patterns)
│                             repository: main/dev/staging, protect main,
│                             required_checks [build, test, validate]; postActions: v2 set
└── template/
    ├── README.md.j2          uses {{ service.repo_name }}, {{ service.tag }}:{{ service.lang }},
    │                         and {% if layout == 'monolith' %} path awareness (services/{{ service.dir }}/)
    ├── CODEOWNERS.j2         from users[].github_login (python-service pattern)
    ├── .editorconfig / .gitignore (wk-go's is .gitignore.j2 — binary name interpolated)
    ├── .claude/skills/       3 per-language skills: {lang}-clean-code,
    │                         property-based-testing (hypothesis/fast-check/xunit/go-fuzz;
    │                         inf: infra-invariants), git-ci-governance
    ├── .github/workflows/    build.yml + test.yml + validate.yml, VERBATIM (non-.j2):
    │                         python ⇒ Alex793x/keel reusable-{build,test,validate}.yml@main callers
    │                         (copied verbatim from python-service); other stacks ⇒ self-contained
    │                         (setup-node 22 / setup-dotnet 8 / setup-go 1.22 / setup-terraform),
    │                         job ids build/test/validate matching the protection contract
    └── <src + tests>         small WORKING module + smoke/property tests per the table above
```

File counts: api-dotnet 16 · api-node 18 · api-python 18 · dp-python 17 · fe-react 21 ·
inf-terraform 14 · wk-go 16 · wk-python 18. No dead placeholder files.

## Verification evidence (scratchpad simulation)

Renderer simulation `render_sim.py` (scratchpad) replicates the frozen renderer rules 1:1
(path-segment interpolation; contents rendered only for `.j2`, suffix stripped; verbatim
otherwise; `keep_trailing_newline=True`) with the faithful v2+v3 context (`derive_context`
fields + `layout` + `service{tag,dir,lang,label,repo_name}`), using **StrictUndefined**
(stricter than MiniJinja's default).

- **16/16 renders green** — all 8 blueprints × `multi-repo` and `monolith` layouts.
- **Zero unrendered `{{ }}`/`{%` markers** in every rendered tree (grep).
- **No `${{` in any `.j2` file** across `blueprints/services/` (grep) — GitHub expressions
  only ever live in verbatim files.
- **No jinja markers in any verbatim (non-`.j2`) template file** (grep) — nothing silently
  un-rendered.
- **Manifests:** all 8 parse as YAML and mirror the proven python-service keel/v2 shape
  (loader has `#[serde(default)]` on every section and ignores unknown keys — `service:`
  is safely additive; verified against `crates/keel-blueprint/src/manifest.rs`).

Green-from-birth runs on the rendered output (uv venv --python 3.12; npm in scratchpad only):

| Repo | Commands | Result |
| --- | --- | --- |
| api-python | `uv pip install -e ".[dev]"` → pytest · ruff check . · black --check . · mypy . | 12 passed; all clean. `dev` extra self-references `[api]` so CI's `pip install ".[dev]"` + `mypy .` type-checks `api.py` (fastapi import verified) |
| wk-python | same gates + `python -m demo_svc` | 14 passed; all clean; worker shell runs (schedule `[0.5 … 60.0]`, batches round-trip) |
| dp-python | same gates | 16 passed; all clean |
| fe-react | npm install → vitest · tsc --noEmit · vite build | 7 passed (2 files); typecheck clean; prod bundle built |
| api-node | npm install → vitest · tsc --noEmit · tsc -p build · `node dist/server.js` + curl | 10 passed; build emits dist/; live: `GET /health` → `{"status":"ok","service":"demo-svc","version":"0.1.0"}`, `DELETE /health` → 405, `GET /nope` → 404 |
| api-dotnet | structural (no local SDK) | csproj XML parsed OK ×2; C# balance OK ×3; **CI-verified pending** (workflows: restore/build/test + `-warnaserror` validate) |
| wk-go | structural (no local toolchain) | tabs-only indentation (gofmt), brace balance OK ×4; backoff loop capped ⇒ no overflow; fuzz seeds incl. `math.MinInt/MaxInt`; **CI-verified pending** |
| inf-terraform | structural (no local terraform) | 2-space indent, per-nesting-level `=` alignment, balance OK ×3; validate is credential-free (`init -backend=false`); **CI-verified pending** |

## Notes & decisions

- **Node CI uses `npm install`, not `npm ci`:** the first commit ships no `package-lock.json`;
  `npm ci` hard-fails without one. Versions are pinned exactly (from `hub/package.json` — no
  invented versions) and each workflow comments "commit the lockfile, then switch to `npm ci`".
- **fe-react/api-node deps** are strictly a subset of `hub/package.json` pins (react 19.2.7,
  vite 7.3.6, vitest 4.1.9, fast-check 4.8.0, typescript 5.9.3, jsdom 29.1.1, …).
- **Monolith composition safety:** engine drops `.github/`, `.claude/`, `CODEOWNERS` etc. from
  service renders (SPEC §12), so shipping per-repo CI/skills/CODEOWNERS is correct for
  multi-repo and harmless for monolith; READMEs explain both layouts via `{% if layout %}`.
- **No mkdocs in the early blueprints** — reusable-validate's docs step is conditional on
  `mkdocs.yml`, so its absence is green, not red.
- **api-dotnet validate** re-builds with `-warnaserror` instead of `dotnet format
  --verify-no-changes` (format verification is fragile without a local SDK to canonicalise).
