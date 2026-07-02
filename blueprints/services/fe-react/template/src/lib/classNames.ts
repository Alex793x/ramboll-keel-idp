/**
 * Pure class-name combinator — the golden-path example of a `src/lib/` helper:
 * no DOM, no React, no side effects, so its behaviour is fully expressible as
 * properties (see `classNames.test.ts`, powered by fast-check).
 */

/** A single class argument: a (possibly multi-token) string, or a falsy skip. */
export type ClassValue = string | false | null | undefined;

/**
 * Combine class names, skipping falsy values and normalising whitespace.
 *
 * Properties (encoded in the fast-check tests):
 * - **Oracle** — the result is exactly the truthy inputs' whitespace-split
 *   tokens, in order, joined by single spaces.
 * - **Clean** — never any leading/trailing or doubled whitespace.
 * - **Idempotent** — `cx(cx(...values))` equals `cx(...values)`.
 */
export function cx(...values: ClassValue[]): string {
  const tokens: string[] = [];
  for (const value of values) {
    if (!value) continue;
    for (const token of value.split(/\s+/)) {
      if (token) tokens.push(token);
    }
  }
  return tokens.join(" ");
}
