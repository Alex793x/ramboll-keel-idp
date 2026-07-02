---
name: typescript-clean-code
description: >-
  Strict TypeScript maintainability standard for this repo. Use whenever
  writing or refactoring TypeScript here. Keep functions small and
  single-responsibility (~<=20 lines), fully typed with no `any`, descriptively
  named, guard-clause early, DRY, dead-code-free, and pure where possible. Code
  must pass `tsc --noEmit` clean under the strict tsconfig.
---

# TypeScript clean code

Maintainability is a requirement, not a preference. Code here must be small,
explicit, typed, and tool-clean. **Explicit over implicit.**

## Functions

- **Small & single-responsibility.** Target **<= ~20 lines**. If a function
  does two things, split it.
- **Pure where possible.** Keep DOM/network/socket work at the edges; keep
  domain logic in pure functions in `src/lib/` (frontend) or pure modules like
  `src/routes.ts` (services) — that is also what makes property testing easy
  (see the `property-based-testing` skill).
- **Guard clauses over nesting.** Return early; avoid deep `if/else` pyramids.

```ts
// Prefer:
export function discount(price: number, member: boolean): number {
  if (price <= 0) throw new RangeError("price must be positive");
  if (!member) return price;
  return Math.round(price * 90) / 100;
}
```

## Types

- **No `any`** — and no `as` casts to silence the checker. Model the real shape
  (discriminated unions like `{ kind: "ok" } | { kind: "not_found" }` beat
  boolean flags and `null` sentinels).
- Annotate every exported function's parameters and return type explicitly.
- The tsconfig is strict (`strict`, `noUncheckedIndexedAccess`,
  `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`) — treat every
  new red squiggle as a design signal, not an obstacle.
- Every exported symbol gets a doc comment stating what it does and, where
  relevant, the *properties* it guarantees.

## Names

- Descriptive, intention-revealing names. No `tmp`, `data2`, `doStuff`.
- Verbs for functions (`normalizePath`), nouns for values; `camelCase` for
  values/functions, `PascalCase` for types/components.

## DRY & dead code

- Extract repeated logic into a well-named helper.
- **No dead code:** unused exports, params, imports, or branches must go.
- Prefer small modules over large catch-all files.

## The tooling gate (non-negotiable)

```bash
npm run typecheck   # tsc --noEmit — the strict tsconfig IS the lint gate
npm test            # Vitest, including the property tests
```

Do not silence findings with blanket `// @ts-ignore`. If a suppression is truly
necessary, use `// @ts-expect-error` with a one-line reason.

## Checklist before opening a PR

- [ ] Each function does one thing; none is a sprawling procedure.
- [ ] No `any`, no unexplained casts; exported signatures fully annotated.
- [ ] Guard clauses instead of deep nesting; no duplicated logic.
- [ ] No dead code, unused imports, or commented-out blocks.
- [ ] `npm run typecheck` and `npm test` are both clean.
