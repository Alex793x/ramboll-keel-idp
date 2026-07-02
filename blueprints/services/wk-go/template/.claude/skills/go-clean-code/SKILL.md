---
name: go-clean-code
description: >-
  Strict Go maintainability standard for this repo. Use whenever writing or
  refactoring Go here. Keep functions small and single-responsibility (~<=20
  lines), total where sensible, descriptively named, guard-clause early, DRY,
  dead-code-free, and pure where possible. Code must pass gofmt and go vet
  clean.
---

# Go clean code

Maintainability is a requirement, not a preference. Code here must be small,
explicit, and tool-clean. **Explicit over implicit.**

## Functions & packages

- **Small & single-responsibility.** Target **<= ~20 lines**. If a function
  does two things, split it.
- **Pure where possible.** Keep the clock, signals, I/O and logging at the
  edges (`main.go` is wiring only); keep domain logic in pure functions in the
  `worker` package — that is what makes it table-testable and fuzzable (see
  the `property-based-testing` skill).
- **Total over panicky.** Prefer functions that are defined for all inputs
  (`Backoff(n <= 0) == 0`) over ones that panic; when failure is meaningful,
  return an `error` — never panic in library code.
- **Guard clauses over nesting.** Return early; avoid deep `if/else` pyramids.

```go
// Prefer:
func Backoff(attempt int) time.Duration {
	if attempt <= 0 {
		return 0
	}
	// ...
}
```

## Docs & names

- Every exported symbol has a doc comment starting with its name, stating what
  it does and the *properties* it guarantees where relevant.
- Descriptive, intention-revealing names. No `tmp`, `data2`, `doStuff`.
- `MixedCaps` per Go convention; short receiver/loop names are fine, cryptic
  package-level names are not.

## DRY & dead code

- Extract repeated logic into a well-named helper.
- **No dead code:** unused functions, params, imports, or branches must go
  (unused imports/vars won't even compile — keep the same bar for the rest).
- Prefer small packages with a single purpose over catch-all ones.

## The tooling gate (non-negotiable)

Code must pass all three clean before pushing — CI enforces them:

```bash
gofmt -l .      # formatting (must print nothing)
go vet ./...    # static analysis
go test ./...   # table tests + fuzz seed corpus
```

Do not silence vet findings with blanket `//nolint`-style comments; fix the
cause or scope a documented exception.

## Checklist before opening a PR

- [ ] Each function does one thing; none is a sprawling procedure.
- [ ] Exported symbols have doc comments; totality/bounds documented.
- [ ] Guard clauses instead of deep nesting; no duplicated logic.
- [ ] No dead code or commented-out blocks.
- [ ] `gofmt -l .` prints nothing; `go vet ./...` and `go test ./...` are clean.
