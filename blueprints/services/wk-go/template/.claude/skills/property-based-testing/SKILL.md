---
name: property-based-testing
description: >-
  Enforce property/invariant testing with Go table tests and fuzzing. Use
  whenever writing, changing, or reviewing a pure Go function in this repo.
  Identify properties (round-trip, idempotency, invariants, metamorphic,
  oracle), pin them with table tests plus a FuzzXxx target with a seed corpus,
  and treat any fuzz counterexample as a real bug.
---

# Property-based testing (table tests + go fuzzing)

In this repository, **every pure function ships with table tests and — where
the input space is non-trivial — a fuzz target pinning its properties.**
Example-based tables check the cases you thought of; the fuzzer checks the
cases you didn't, and shrinks failures to minimal counterexamples.

## The rule

> For each pure exported function, state at least one property that must hold
> for **all** valid inputs, and encode it as a `FuzzXxx` target (with seed
> corpus) or an exhaustive table. No exceptions for "obvious" functions.

## How to find properties

| Property | Question to ask | Shape |
| --- | --- | --- |
| **Round-trip** | Does `Decode(Encode(x)) == x`? | `fInv(f(x)) == x` |
| **Idempotency** | Does applying twice change anything? | `f(f(x)) == f(x)` |
| **Invariant** | What is always true of the output? | `if !prop(f(x)) { t.Fatal }` |
| **Metamorphic** | How does output change when input changes? | `f(g(x)) == h(f(x))` |
| **Oracle** | Is there a slow/simple reference? | `f(x) == reference(x)` |

Concrete examples from this repo's `worker` package:

- `Backoff` is **total** (never panics) and **bounded**: always in `[0, 60s]`.
- `Backoff` is **monotone** (metamorphic): `Backoff(n) <= Backoff(n+1)`.
- `Schedule` matches an **oracle**: entry `i` equals `Backoff(i+1)`.

## How to write the test

```go
func FuzzBackoffMonotonic(f *testing.F) {
	for _, seed := range []int{-1, 0, 1, 8, 100} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, attempt int) {
		if got := Backoff(attempt); got < 0 || got > 60*time.Second {
			t.Fatalf("Backoff(%d) = %v, out of bounds", attempt, got)
		}
	})
}
```

Guidelines:

- Fuzz targets live beside the code in `*_fuzz_test.go`; seed the corpus with
  the known edge cases (zero, negatives, cap boundary, extremes).
- Seeds run on every plain `go test` — the property is checked in CI even
  without a fuzzing session. Explore deeper locally with
  `go test -fuzz=FuzzXxx -fuzztime=30s ./...`.
- Keep each target asserting **one** property cluster; name it after the
  property (`FuzzBackoffMonotonic`).
- Guard arithmetic edges explicitly (e.g. skip `attempt+1` at `math.MaxInt`).

## When a test fails

1. The fuzzer writes the counterexample to `testdata/fuzz/…` — that is a real
   bug, not test noise. Do not weaken the property to make it pass.
2. Commit the discovered input as a permanent seed, fix the function, re-run.

## Workflow checklist

- [ ] Every new/changed pure function has a table test; non-trivial input
      spaces also get a fuzz target with seeds.
- [ ] Fuzz counterexamples were fixed and committed as seeds, not deleted.
- [ ] `go test ./...` is green locally before pushing.
