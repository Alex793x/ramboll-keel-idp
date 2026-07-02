---
name: property-based-testing
description: >-
  Enforce property/invariant testing for pure C# helpers. Use whenever writing,
  changing, or reviewing a pure method in this repo. Identify properties
  (round-trip, idempotency, invariants, metamorphic, oracle), pin them with
  exhaustive xUnit Theory tables today, adopt FsCheck when an input space
  outgrows tables, and treat any counterexample as a real bug.
---

# Property-based testing (xUnit theories → FsCheck)

In this repository, **every pure helper ships with tests that pin its
*properties*** — invariants that hold for all valid inputs — not just a happy
path. Today that is done with exhaustive xUnit `[Theory]` tables over the
input categories; when a helper's input space outgrows enumerable categories,
add **FsCheck** and generate inputs instead.

## The rule

> For each pure public method, state at least one property that must hold for
> **all** valid inputs, and encode it as a Theory over every input category
> (or an FsCheck property). No exceptions for "obvious" methods.

## How to find properties

| Property | Question to ask | Shape |
| --- | --- | --- |
| **Round-trip** | Does `Decode(Encode(x)) == x`? | `FInv(F(x)) == x` |
| **Idempotency** | Does applying twice change anything? | `F(F(x)) == F(x)` |
| **Invariant** | What is always true of the output? | `Assert.True(Prop(F(x)))` |
| **Metamorphic** | How does output change when input changes? | `F(G(x)) == H(F(x))` |
| **Oracle** | Is there a slow/simple reference? | `F(x) == Reference(x)` |

Concrete examples from this repo's `StatusInfo`:

- **Invariant** — blank/null service names always normalise to `"unknown"`;
  surviving names never carry edge whitespace.
- **Invariant** — a blank version always falls back to `StatusInfo.Version`.
- **Determinism** (oracle against itself) — equal inputs produce equal
  payloads; records compare by value, so purity is directly assertable.

## How to write the test

```csharp
[Theory]
[InlineData(null)]
[InlineData("")]
[InlineData("   ")]
[InlineData("\t\n")]
public void Create_NormalisesBlankServiceNamesToUnknown(string? service)
{
    Assert.Equal("unknown", StatusInfo.Create(service).Service);
}
```

Guidelines:

- Cover **every input category** (null, empty, whitespace-only, edge-padded,
  normal) — a Theory that lists one case is an example, not a property.
- Keep each test asserting **one** property; name it after the property.
- When categories stop being enumerable (parsers, math, collections), add the
  FsCheck package and express the property over generated inputs.

## When a test fails

1. A failing category or FsCheck counterexample is a **real bug**, not test
   noise. Do not weaken the property to make it pass.
2. Pin the failing input as an `[InlineData]` regression row, fix the method,
   then re-run.

## Workflow checklist

- [ ] Every new/changed pure method has ≥1 property-style test.
- [ ] Theories cover all input categories, not just the happy path.
- [ ] A counterexample was treated as a bug and fixed, not suppressed.
- [ ] `dotnet test` is green locally before pushing.
