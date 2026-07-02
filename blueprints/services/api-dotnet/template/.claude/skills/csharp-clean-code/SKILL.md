---
name: csharp-clean-code
description: >-
  Strict C# maintainability standard for this repo. Use whenever writing or
  refactoring C# here. Keep methods small and single-responsibility (~<=20
  lines), nullable-aware (Nullable enabled, warnings as errors), descriptively
  named, guard-clause early, DRY, dead-code-free, and pure where possible.
  Builds must be warning-clean (-warnaserror).
---

# C# clean code

Maintainability is a requirement, not a preference. Code here must be small,
explicit, typed, and warning-clean. **Explicit over implicit.**

## Methods & types

- **Small & single-responsibility.** Target **<= ~20 lines** per method. If a
  method does two things, split it.
- **Pure where possible.** Keep hosting, I/O and the clock at the edges
  (`Program.cs` is wiring only); keep domain logic in pure, static,
  deterministic helpers like `StatusInfo` — that is what makes them testable
  without spinning up the host.
- **Records for data.** Immutable payloads are `sealed record` types with
  value equality (`StatusPayload`), not mutable property-bag classes.
- **Guard clauses over nesting.** Normalise/validate inputs first and return
  early; avoid deep `if/else` pyramids.

```csharp
// Prefer:
public static StatusPayload Create(string? service, string? version)
{
    var name = string.IsNullOrWhiteSpace(service) ? "unknown" : service.Trim();
    var resolvedVersion = string.IsNullOrWhiteSpace(version) ? Version : version.Trim();
    return new StatusPayload("ok", name, resolvedVersion);
}
```

## Nullability & docs

- `<Nullable>enable</Nullable>` everywhere: model absence with `string?` and
  normalise at the boundary — never let `null` travel through domain logic.
- Every public type/member has an XML doc comment stating what it does and,
  where relevant, the *invariants* it guarantees.

## Names

- Descriptive, intention-revealing names. No `Tmp`, `Data2`, `DoStuff`.
- `PascalCase` for types/members, `camelCase` locals; verbs for methods
  (`Create`, `Normalise`), nouns for types.

## DRY & dead code

- Extract repeated logic into a well-named helper.
- **No dead code:** unused members, params, usings, or branches must go.
- Prefer small, focused files (one public type per file).

## The tooling gate (non-negotiable)

Both projects set `TreatWarningsAsErrors`; CI re-enforces it in **validate**:

```bash
dotnet build src/Api/Api.csproj -c Release -warnaserror
dotnet test tests/Api.Tests/Api.Tests.csproj -c Release
```

Do not suppress warnings with blanket `#pragma warning disable`. If a
suppression is truly necessary, scope it to one line and add a reason.

## Checklist before opening a PR

- [ ] Each method does one thing; none is a sprawling procedure.
- [ ] Nullable-clean: absence modelled with `?`, normalised at the boundary.
- [ ] Guard clauses instead of deep nesting; no duplicated logic.
- [ ] No dead code, unused usings, or commented-out blocks.
- [ ] `dotnet build -warnaserror` and `dotnet test` are both clean.
