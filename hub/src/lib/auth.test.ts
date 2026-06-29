import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { authenticate, deriveName, isRambollEmail } from "./auth";

describe("isRambollEmail", () => {
  it("accepts ramboll.com addresses (case-insensitive)", () => {
    expect(isRambollEmail("anya.sorensen@ramboll.com")).toBe(true);
    expect(isRambollEmail("Anya@RAMBOLL.COM")).toBe(true);
    expect(isRambollEmail("  bo@ramboll.com  ")).toBe(true);
  });

  it("rejects non-ramboll and malformed addresses", () => {
    expect(isRambollEmail("user@gmail.com")).toBe(false);
    expect(isRambollEmail("@ramboll.com")).toBe(false);
    expect(isRambollEmail("ramboll.com")).toBe(false);
    expect(isRambollEmail("")).toBe(false);
    expect(isRambollEmail("a b@ramboll.com")).toBe(false);
  });

  it("property: any non-empty local part + @ramboll.com is accepted", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9._-]{0,20}$/),
        (local) => {
          expect(isRambollEmail(`${local}@ramboll.com`)).toBe(true);
        },
      ),
    );
  });
});

describe("authenticate", () => {
  it("succeeds for a ramboll email with a password", () => {
    const r = authenticate("anya@ramboll.com", "pw");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.session.email).toBe("anya@ramboll.com");
      expect(r.session.name).toBe("Anya");
    }
  });

  it("rejects an empty password", () => {
    const r = authenticate("anya@ramboll.com", "   ");
    expect(r.ok).toBe(false);
  });

  it("rejects a non-ramboll email", () => {
    const r = authenticate("anya@gmail.com", "pw");
    expect(r.ok).toBe(false);
  });
});

describe("deriveName", () => {
  it("titlecases the email local part", () => {
    expect(deriveName("anya.sorensen@ramboll.com")).toBe("Anya Sorensen");
    expect(deriveName("bo_andersson@ramboll.com")).toBe("Bo Andersson");
  });
});
