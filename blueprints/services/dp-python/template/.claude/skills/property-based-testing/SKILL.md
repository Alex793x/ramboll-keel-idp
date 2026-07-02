---
name: property-based-testing
description: >-
  Enforce property/invariant testing with Hypothesis. Use whenever writing,
  changing, or reviewing a pure Python function in this repo. Identify properties
  (round-trip, idempotency, invariants, metamorphic, oracle), write @given
  strategies, keep property tests beside unit tests, and treat any shrinking
  counterexample as a real bug.
---

# Property-based testing (Hypothesis)

In this repository, **every new public function ships with at least one property
test.** Example-based tests check the cases you thought of; property tests check
the cases you didn't. Hypothesis generates many inputs, finds failures, and
*shrinks* them to a minimal counterexample.

## The rule

> For each pure public function, state at least one property that must hold for
> **all** valid inputs, and encode it as a Hypothesis test. No exceptions for
> "obvious" functions.

## How to find properties

Work through these lenses for each function — most functions satisfy several:

| Property | Question to ask | Shape |
| --- | --- | --- |
| **Round-trip** | Does `decode(encode(x)) == x`? | `f_inv(f(x)) == x` |
| **Idempotency** | Does applying twice change anything? | `f(f(x)) == f(x)` |
| **Invariant** | What is always true of the output? | `assert prop(f(x))` |
| **Metamorphic** | How does output change when input changes? | `f(g(x)) == h(f(x))` |
| **Oracle** | Is there a slow/simple reference? | `f(x) == reference(x)` |

Concrete examples from this repo's `pipeline.py`:

- `normalize_record` is **idempotent** (the round-trip for a normaliser):
  re-normalising a normalised record changes nothing.
- `normalize_key` has a **charset invariant**: output matches `^[a-z0-9_]*$`
  with no edge/doubled underscores.
- `partition_records` is **lossless** (oracle): both lanes together hold every
  record exactly once, order preserved.

## How to write the test

```python
from hypothesis import given
from hypothesis import strategies as st

from <package>.pipeline import normalize_key


@given(st.text())
def test_normalize_key_is_idempotent(key: str) -> None:
    once = normalize_key(key)
    assert normalize_key(once) == once
```

Guidelines:

- Place property tests in `tests/test_properties.py`, beside the unit tests.
- Use the **widest correct strategy** (`st.text()`, not just ASCII) so Unicode,
  whitespace, and control characters are exercised.
- Constrain inputs with `st.builds`, `assume()`, or filtered strategies only when
  the property genuinely requires it — never to hide a real bug.
- Keep each test asserting **one** property; name it after the property.
- Add `@example(...)` for known tricky inputs you want pinned.

## When a test fails

1. Hypothesis prints a **minimal failing example** — that is a real bug, not test
   noise. Do not weaken the property to make it pass.
2. Reproduce it as a one-line example test, fix the function, then re-run.
3. Hypothesis records the failure in `.hypothesis/` and will re-try it first.

## Workflow checklist

- [ ] Every new/changed pure function has ≥1 property test.
- [ ] Properties use the widest correct input strategy.
- [ ] A shrinking counterexample was treated as a bug and fixed, not suppressed.
- [ ] `pytest` is green locally before pushing.
