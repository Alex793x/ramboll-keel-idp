---
name: property-based-testing
description: >-
  Enforce property/invariant testing with fast-check. Use whenever writing,
  changing, or reviewing a pure TypeScript function in this repo. Identify
  properties (round-trip, idempotency, invariants, metamorphic, oracle), write
  fc.property arbitraries, keep property tests beside unit tests, and treat any
  shrinking counterexample as a real bug.
---

# Property-based testing (fast-check)

In this repository, **every pure function in `src/lib/` (and any other pure
module) ships with at least one property test.** Example-based tests check the
cases you thought of; property tests check the cases you didn't. fast-check
generates many inputs, finds failures, and *shrinks* them to a minimal
counterexample.

## The rule

> For each pure exported function, state at least one property that must hold
> for **all** valid inputs, and encode it as a fast-check test. No exceptions
> for "obvious" functions.

## How to find properties

Work through these lenses for each function — most functions satisfy several:

| Property | Question to ask | Shape |
| --- | --- | --- |
| **Round-trip** | Does `decode(encode(x)) == x`? | `fInv(f(x)) === x` |
| **Idempotency** | Does applying twice change anything? | `f(f(x)) === f(x)` |
| **Invariant** | What is always true of the output? | `expect(prop(f(x)))` |
| **Metamorphic** | How does output change when input changes? | `f(g(x)) === h(f(x))` |
| **Oracle** | Is there a slow/simple reference? | `f(x) === reference(x)` |

Concrete examples from this repo's `src/lib/classNames.ts`:

- `cx` matches an **oracle**: the truthy inputs' whitespace-split tokens, in
  order, joined by single spaces.
- `cx` is **idempotent**: `cx(cx(...values)) === cx(...values)`.
- `cx` has a **cleanliness invariant**: never edge or doubled whitespace.

## How to write the test

```ts
import fc from "fast-check";
import { expect, it } from "vitest";
import { cx } from "./classNames";

it("is idempotent", () => {
  fc.assert(
    fc.property(fc.array(fc.string()), (values) => {
      const once = cx(...values);
      expect(cx(once)).toBe(once);
    }),
  );
});
```

Guidelines:

- Keep property tests **beside** the unit tests in the same `*.test.ts` file.
- Use the **widest correct arbitrary** (`fc.string()`, not a narrow regex) so
  whitespace and odd characters are exercised; add narrow arbitraries only to
  *increase* coverage of realistic shapes, never to dodge a failure.
- Keep each test asserting **one** property; name it after the property.
- Pin known tricky inputs as plain example tests next to the properties.

## When a test fails

1. fast-check prints a **minimal shrunk counterexample** — that is a real bug,
   not test noise. Do not weaken the property to make it pass.
2. Reproduce it as a one-line example test, fix the function, then re-run.
3. Keep the example test as a regression pin.

## Workflow checklist

- [ ] Every new/changed pure function has ≥1 property test.
- [ ] Properties use the widest correct arbitrary.
- [ ] A shrinking counterexample was treated as a bug and fixed, not suppressed.
- [ ] `npm test` is green locally before pushing.
