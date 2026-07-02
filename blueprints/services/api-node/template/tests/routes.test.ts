import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normalizePath, resolveRoute, type Route } from "../src/routes.js";

const okBody = { status: "ok" };
const table: Route[] = [
  { method: "GET", path: "/health", handle: () => ({ status: 200, body: okBody }) },
  { method: "POST", path: "/jobs", handle: () => ({ status: 202, body: {} }) },
];

describe("normalizePath (property-based)", () => {
  it("always yields a rooted, canonical path", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const path = normalizePath(raw);
        expect(path.startsWith("/")).toBe(true);
        expect(path).not.toMatch(/\/\//);
        expect(path).not.toContain("?");
        expect(path).not.toContain("#");
        if (path.length > 1) {
          expect(path.endsWith("/")).toBe(false);
        }
      }),
    );
  });

  it("is idempotent", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const once = normalizePath(raw);
        expect(normalizePath(once)).toBe(once);
      }),
    );
  });
});

describe("resolveRoute (property-based)", () => {
  it("resolves nothing against an empty table", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (method, path) => {
        expect(resolveRoute([], method, path)).toEqual({ kind: "not_found" });
      }),
    );
  });

  it("is total: never throws for arbitrary method/path inputs", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (method, path) => {
        const resolution = resolveRoute(table, method, path);
        expect(["ok", "method_not_allowed", "not_found"]).toContain(resolution.kind);
      }),
    );
  });

  it("matches methods case-insensitively and paths after normalization", () => {
    fc.assert(
      fc.property(fc.constantFrom("get", "GET", "GeT"), (method) => {
        const resolution = resolveRoute(table, method, "//health/?probe=1");
        expect(resolution).toEqual({ kind: "ok", response: { status: 200, body: okBody } });
      }),
    );
  });
});

describe("resolveRoute (examples)", () => {
  it("answers the health route", () => {
    const resolution = resolveRoute(table, "GET", "/health");
    expect(resolution.kind).toBe("ok");
  });

  it("returns method_not_allowed with the allowed methods", () => {
    expect(resolveRoute(table, "DELETE", "/health")).toEqual({
      kind: "method_not_allowed",
      allowed: ["GET"],
    });
  });

  it("returns not_found for unknown paths", () => {
    expect(resolveRoute(table, "GET", "/nope")).toEqual({ kind: "not_found" });
  });
});
