# Area 6 — Python blueprint refine (`blueprints/python-service/`)

**Owner:** Fleet-Blueprint-PY · **Status:** ✅ done · **Branch:** `main`

Refined the retained v1 Python golden-path blueprint for the v2 department/users
ownership model and the v2 reusable-CI reference. Engine renders with MiniJinja;
templates kept MiniJinja/Jinja2-compatible (only `{{ }}`, `{% if %}`, `{% for %}`,
`loop.last`).

---

## What changed

### Render context: `owning_team` → `department` + `users`
v1 collected a single `owning_team` string. v2 injects `department`
(`{id, name, team_slug}`) and `users` (`[{id, name, email, github_login}]`) from the
Hub's selection step. Every `owning_team` reference was replaced (verified: zero
`owning_team` left in the subtree).

| File | Change |
| --- | --- |
| `template/CODEOWNERS.j2` | Owners = department team + each selected user (see below). All three lines (`*`, `/.github/`, `/.claude/`). |
| `template/README.md.j2` | "owned by the **{{ department.name }}** department (user names…)". |
| `template/architecture.md.j2` | same ownership line. |
| `template/CONTRIBUTING.md.j2` | intro owner line + CODEOWNERS approval line now lists `@team_slug` + each `@github_login`. |
| `template/docs/index.md.j2`, `template/docs/architecture.md.j2` | department + user names. |
| `template/CLAUDE.md.j2`, `template/AGENTS.md.j2` | department + user names. |
| `template/mkdocs.yml.j2` | `site_author: {{ department.name }}` (scalar — no loop). |
| `template/pyproject.toml.j2` | keyword `{{ department.team_slug }}`. |
| `template/src/{{ package_name }}/__init__.py.j2`, `core.py.j2`, `api.py.j2` | docstring "Owned by the {{ department.name }} department.". |
| `template/.claude/skills/git-ci-governance/SKILL.md` | example + pin note updated to the v2 reusable ref (verbatim file, no `${{`). |

### Manifest (`blueprint.yaml`)
- `apiVersion: keel/v1` → `keel/v2`; `metadata.version: "1.0.0"` → `"2.0.0"`.
- Removed the `owning_team` parameter. `parameters` now = `project_name`,
  `service_kind`, `description`, `author` (department + users come from the Hub
  selection step, not the manifest form). Added a comment documenting this.
- Kept `template.conditions` (`api.py` only for `rest-api`), `repository`
  (branches `main/dev/staging` + protect rules), `postActions` — all unchanged.

### Reusable CI reference (v2)
`template/.github/workflows/{build,test,validate}.yml` updated from
`Ramboll-RDP/keel/.github/workflows/reusable-*.yml@v1` to
**`Alex793x/keel/.github/workflows/reusable-{build,test,validate}.yml@main`**.
These are VERBATIM `.yml` files (no `.j2`); they contain no `${{` of their own and
were not converted to templates.

### Preserved
Branch model (`main`/`dev`/`staging`, `feature/`·`bug/`·`hotfix/`), the three AI
skills (`property-based-testing`, `python-clean-code`, `git-ci-governance`), and the
three GitHub Actions (build/test/validate).

---

## CODEOWNERS output (rendered for dept "Water" team_slug `ramboll/water` + users Alex793x, bonielsen)

```
# CODEOWNERS — required reviewers for invoicing-api.
# Branch protection on `main` requires CODEOWNERS approval (see CONTRIBUTING.md).
# Syntax: https://docs.github.com/articles/about-code-owners

# Owned by the Water department and the selected users.
* @ramboll/water @Alex793x @bonielsen

# Keep CI governance and the embedded standards owned explicitly.
/.github/        @ramboll/water @Alex793x @bonielsen
/.claude/        @ramboll/water @Alex793x @bonielsen
```

Asserted programmatically: contains `@ramboll/water` (team_slug) + both
`github_login`s, and no `owning_team`.

---

## Constraint checks

- `grep -rn 'owning_team' .` → empty ✅
- `grep -rln '\${{' template --include='*.j2'` → empty ✅ (no GitHub expressions in any `.j2`)
- `grep -rn 'Ramboll-RDP' .` → empty ✅ (incl. the skill doc example)
- Rendered tree: no leftover `.j2`, no unrendered `{{ }}` ✅

---

## Green-from-birth results (outside the repo, in scratchpad)

Faithful MiniJinja-contract render harness (path `{{ }}` always; contents render
only for `.j2` then strip suffix; verbatim otherwise; honor `template.conditions`).
Sample request: `project_name=invoicing-api`, `service_kind=rest-api`, department
`Water`/`ramboll/water`, 2 users (Alex793x, bonielsen).

Render: Python `jinja2` (MiniJinja proxy) → `package_name` derived to `invoicing_api`,
`api.py` present (rest-api). Then isolated venv via `uv venv --python 3.12`:

```
uv venv --python 3.12 .venv
uv pip install -e ".[dev,api]"          # (VIRTUAL_ENV set to the venv)
.venv/bin/pytest -q          → 12 passed in 0.54s              ✅
.venv/bin/ruff check .       → All checks passed!              ✅
.venv/bin/black --check .    → 6 files would be left unchanged ✅
.venv/bin/mypy .             → Success: no issues found in 6 source files ✅
```

Conditional re-verified with a `worker` render: `api.py` correctly EXCLUDED;
CODEOWNERS identical.

All work done in scratchpad (`…/scratchpad/out`, `…/out_worker`) — the repo working
tree was not dirtied by the render/test.

---

## MemTrace

- START `fleet_publish_intent` repo_id `keel`, agent_id `fleet-blueprint-py`,
  branch `main`, intent `{"feature":{"surface":"module"}}` → `intent_id`
  `01KW8C4W5QE1JZNB8JYZMZTS3C`, `active_conflicts: []`, advice `clear`.
- END `fleet_record_episode` recorded (see Decisions / session episode).
