import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cx, type ClassValue } from "./classNames";

/** Arbitrary cx argument: strings (with whitespace) or falsy skips. */
const classValue = fc.oneof(
  fc.string(),
  fc.stringMatching(/^[a-z-]{1,8}( [a-z-]{1,8}){0,3}$/),
  fc.constant(false as const),
  fc.constant(null),
  fc.constant(undefined),
);

/** Reference implementation: truthy inputs, whitespace-split, joined once. */
function oracle(values: ClassValue[]): string {
  return values
    .flatMap((value) => (value ? value.split(/\s+/) : []))
    .filter((token) => token.length > 0)
    .join(" ");
}

describe("cx (property-based)", () => {
  it("matches the oracle: ordered truthy tokens joined by single spaces", () => {
    fc.assert(
      fc.property(fc.array(classValue), (values) => {
        expect(cx(...values)).toBe(oracle(values));
      }),
    );
  });

  it("never produces edge or doubled whitespace", () => {
    fc.assert(
      fc.property(fc.array(classValue), (values) => {
        const result = cx(...values);
        expect(result).toBe(result.trim());
        expect(result).not.toMatch(/\s{2,}/);
      }),
    );
  });

  it("is idempotent", () => {
    fc.assert(
      fc.property(fc.array(classValue), (values) => {
        const once = cx(...values);
        expect(cx(once)).toBe(once);
      }),
    );
  });
});

describe("cx (examples)", () => {
  it("joins and skips falsy values", () => {
    expect(cx("app", false, "app--ready", null, undefined)).toBe("app app--ready");
  });

  it("splits multi-token strings and drops empties", () => {
    expect(cx("  a   b ", "", "c")).toBe("a b c");
  });

  it("returns the empty string when nothing survives", () => {
    expect(cx(false, "", "   ", null)).toBe("");
  });
});
