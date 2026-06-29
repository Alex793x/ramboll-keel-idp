import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  PROJECT_NAME_PATTERN,
  validateProjectName,
} from "./validation";

describe("validateProjectName", () => {
  it("accepts canonical names", () => {
    expect(validateProjectName("invoicing-api")).toBe(true);
    expect(validateProjectName("abc")).toBe(true);
    expect(validateProjectName("a1b2-c3")).toBe(true);
  });

  it("rejects malformed names", () => {
    expect(validateProjectName("ab")).toBe(false); // too short
    expect(validateProjectName("1abc")).toBe(false); // must start with letter
    expect(validateProjectName("Abc")).toBe(false); // no uppercase
    expect(validateProjectName("a_b")).toBe(false); // underscore
    expect(validateProjectName("a b")).toBe(false); // space
    expect(validateProjectName("-ab")).toBe(false); // starts with dash
    expect(validateProjectName("")).toBe(false);
    expect(validateProjectName("a".repeat(42))).toBe(false); // too long (>41)
  });

  it("agrees with the documented regex on length boundaries", () => {
    expect(validateProjectName("a".repeat(41))).toBe(true); // max length
    expect(PROJECT_NAME_PATTERN.test("a".repeat(41))).toBe(true);
    expect(PROJECT_NAME_PATTERN.test("a".repeat(42))).toBe(false);
  });

  describe("property: function matches the canonical regex for all strings", () => {
    it("agrees with the regex on arbitrary strings", () => {
      fc.assert(
        fc.property(fc.string(), (s) => {
          // The hand-rolled checker must agree exactly with the frozen regex.
          // (Use a fresh regex each time to avoid lastIndex statefulness.)
          const re = /^[a-z][a-z0-9-]{2,41}$/;
          // Note: regex {2,40} after the first char = total 3..41; our spec
          // pattern uses {2,40}. Build it precisely here:
          const spec = new RegExp("^[a-z][a-z0-9-]{2,40}$");
          void re;
          expect(validateProjectName(s)).toBe(spec.test(s));
        }),
      );
    });
  });

  describe("property: generated valid names always pass", () => {
    it("every string matching the grammar validates", () => {
      const validName = fc
        .tuple(
          fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")),
          fc.stringMatching(/^[a-z0-9-]{2,40}$/),
        )
        .map(([first, rest]) => first + rest);
      fc.assert(
        fc.property(validName, (name) => {
          expect(validateProjectName(name)).toBe(true);
        }),
      );
    });
  });

  describe("property: malformed names always fail", () => {
    it("names with an illegal character never validate", () => {
      // Inject a character outside [a-z0-9-] and assert rejection.
      const illegalChar = fc.constantFrom(
        ..."ABC_!. @/$".split(""),
      );
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-z0-9-]{2,30}$/),
          fc.nat({ max: 30 }),
          illegalChar,
          (base, pos, bad) => {
            const at = pos % base.length;
            const mutated = base.slice(0, at) + bad + base.slice(at);
            expect(validateProjectName(mutated)).toBe(false);
          },
        ),
      );
    });

    it("uppercase first letter always fails", () => {
      fc.assert(
        fc.property(fc.stringMatching(/^[a-z][a-z0-9-]{2,40}$/), (name) => {
          const upper = name.charAt(0).toUpperCase() + name.slice(1);
          expect(validateProjectName(upper)).toBe(false);
        }),
      );
    });
  });
});
