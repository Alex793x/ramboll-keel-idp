# Blueprints

A **blueprint** is the unit of standardization — and of governance. It is a self-contained,
version-controlled directory that encodes one strong, sensible default for everything: layout,
branches, CI, docs. Changing a standard is a pull request to a blueprint, not a memo.

The MVP ships one: the **Python golden path** at `blueprints/python-service/`.

## How a blueprint is structured

```
blueprints/python-service/
├── blueprint.yaml        # the manifest
└── template/             # the file tree of the generated repo
    ├── README.md.j2
    ├── architecture.md.j2
    ├── CODEOWNERS.j2
    ├── pyproject.toml.j2
    ├── mkdocs.yml.j2
    ├── .claude/skills/…  # the three AI agent skills
    ├── .github/workflows/{build,test,validate}.yml   # reference reusable CI (verbatim)
    ├── src/{{ package_name }}/…
    ├── tests/…
    └── docs/…
```

## The manifest (`blueprint.yaml`)

```yaml
apiVersion: keel/v2
kind: Blueprint
metadata:
  name: python-service
  title: Python Service
  version: "2.0.0"
parameters:        # FORM FIELDS ONLY
  - { id: project_name, type: string, pattern: "^[a-z][a-z0-9-]{2,40}$", required: true }
  - { id: service_kind, type: enum, values: [rest-api, worker], default: rest-api }
  - { id: description,  type: string, required: true }
  - { id: author,       type: string, required: true }
template:
  root: template
  rename: ".j2"
  conditions:
    - when: "service_kind == 'rest-api'"
      paths: ["src/{{ package_name }}/api.py"]
repository:
  default_branch: main
  branches: [main, dev, staging]
  protect:
    - { branch: main, require_pull_request: true, required_reviews: 1, require_codeowners: true,
        required_checks: [build, test, validate] }
postActions: [create_repository, commit_template, setup_branches, apply_protection,
              enable_ci, publish_docs, register_in_catalog]
```

Key point: the manifest collects **form parameters only**. Ownership — the **department** and the
**selected users** — is *not* a form field. It comes from the hub's selection step and is injected
into the render context (see below) so it can drive CODEOWNERS.

## The renderer rule: `.j2` vs verbatim

This rule is what keeps the output correct:

- **Path segments** always interpolate `{{ ... }}` — `src/{{ package_name }}/api.py` →
  `src/demo_svc/api.py`.
- **File contents** render through MiniJinja **only if the filename ends in `.j2`**; the suffix is
  then stripped (`README.md.j2` → `README.md`).
- **Everything else is copied byte-for-byte.**

The verbatim rule matters most for GitHub Actions: workflow files use `${{ ... }}` expression
syntax that must reach the generated repo untouched. Because they are not `.j2`, the renderer never
treats their `${{ }}` as template syntax.

### The render context

`derive_context(req)` injects at minimum:

- `package_name` — the project name with `-`→`_`, made a keyword-safe identifier;
- `year`;
- `branch_conventions` — `feature/`, `bug/`, `hotfix/`;
- `department` — including its `name` and `team_slug`;
- `users` — each with its `github_login`.

`template.conditions` are honored: e.g. the FastAPI `api.py` is only rendered when
`service_kind == 'rest-api'`.

## The three AI agent skills

Every generated repo embeds three skills under `.claude/skills/`. They turn Ramboll standards into
agent-readable, enforceable rules so an AI coding agent working in the repo stays on the golden path:

| Skill | What it enforces |
| --- | --- |
| **`python-clean-code`** | Small, single-responsibility functions (~≤20 lines, complexity ≤10), full type hints + docstrings, guard clauses, DRY, no dead code. Must pass `ruff`, `black`, `mypy` clean. |
| **`property-based-testing`** | Every new pure public function ships at least one **Hypothesis** property test (round-trip, idempotency, invariant, metamorphic, oracle). A shrinking counterexample is a real bug. |
| **`git-ci-governance`** | The `main`/`dev`/`staging` model; branch names matching `^(feature\|bug\|hotfix)/[A-Z]+-[0-9]+-[a-z0-9-]+$`; Conventional Commits; PRs into `dev` with review + CODEOWNERS + green Build/Test/Validate; CI references the reusable workflows only. |

## How to add a blueprint

1. Create `blueprints/<name>/` with a `blueprint.yaml` (`apiVersion: keel/v2`, `kind: Blueprint`)
   and a `template/` tree.
2. Define `parameters` (form fields), the `template` block (root, the `.j2` rename rule, any
   `conditions`), the `repository` block (default branch, branches, protection), and `postActions`.
3. Author the template tree using the renderer rule — append `.j2` to any file whose contents need
   templating; leave workflow files and other verbatim files without the suffix.
4. Include a `CODEOWNERS.j2` that consumes `department.team_slug` and `users[].github_login` so the
   selection drives ownership.
5. Embed the three skills and the three reusable-CI-referencing workflows so the repo is green by
   construction.
6. Cover the blueprint with tests (property tests for the renderer and `validate_request`). In the
   documented future, blueprints are validated in CI by being initialized into throwaway repos on
   every change.

See [Governance](governance.md) for the standards a blueprint must encode, and
[../architecture.md §5](../architecture.md) for the full anatomy.
