---
name: python-clean-code
description: >-
  Strict Python maintainability standard for this repo. Use whenever writing or
  refactoring Python here. Keep functions small and single-responsibility (~<=20
  lines, cyclomatic complexity <= 10), fully type-hinted with docstrings,
  descriptively named, guard-clause early, DRY, dead-code-free, and pure where
  possible. Code must pass ruff, black, and mypy clean.
---

# Python clean code

Maintainability is a requirement, not a preference. Code here must be small,
explicit, typed, and tool-clean. **Explicit over implicit.**

## Functions

- **Small & single-responsibility.** Target **<= ~20 lines** and **cyclomatic
  complexity <= 10**. If a function does two things, split it.
- **Pure where possible.** Keep I/O and mutation at the edges; keep domain logic
  in pure functions (this is also what makes property testing easy — see the
  `property-based-testing` skill).
- **Guard clauses over nesting.** Return early; avoid deep `if/else` pyramids.

```python
# Prefer:
def discount(price: float, member: bool) -> float:
    if price <= 0:
        raise ValueError("price must be positive")
    if not member:
        return price
    return round(price * 0.9, 2)
```

## Types & docstrings

- **Full type hints** on every public function signature (params and return).
- Use `from __future__ import annotations` and precise types (`dict[str, int]`,
  `Sequence[str]`, `X | None`).
- Every public function/class/module has a **docstring** stating what it does,
  its args, and what it returns. Document the *properties* it guarantees where
  relevant.

## Names

- Descriptive, intention-revealing names. No `tmp`, `data2`, `do_stuff`.
- Verbs for functions (`normalize_whitespace`), nouns for values.
- Follow PEP 8 / `N` (pep8-naming) — `snake_case` funcs, `PascalCase` classes,
  `UPPER_SNAKE` constants.

## DRY & dead code

- Extract repeated logic into a well-named helper.
- **No dead code:** unused functions, params, imports, or branches must go. If
  it has zero callers and is not public API, delete it.
- Prefer composition and small modules over large catch-all files.

## The tooling gate (non-negotiable)

Code must pass all three clean before pushing — CI enforces them in **Validate**:

```bash
ruff check .        # lint: pyflakes, pycodestyle, isort, bugbear, simplify, naming...
black --check .     # formatting (line length 100)
mypy                # strict type checking
```

Do not silence findings with blanket `# noqa` / `# type: ignore`. If a suppression
is truly necessary, make it specific (`# noqa: E501`, `# type: ignore[arg-type]`)
and add a one-line reason.

## Checklist before opening a PR

- [ ] Each function does one thing; none is a sprawling procedure.
- [ ] Full type hints + docstrings on all public symbols.
- [ ] Guard clauses instead of deep nesting; no duplicated logic.
- [ ] No dead code, unused imports, or commented-out blocks.
- [ ] `ruff check .`, `black --check .`, and `mypy` are all clean.
