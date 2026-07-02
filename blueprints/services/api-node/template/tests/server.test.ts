import { describe, expect, it } from "vitest";
import { resolveRoute } from "../src/routes.js";
import { routes, SERVICE_NAME, SERVICE_VERSION } from "../src/server.js";

// Importing `server.ts` must NOT open a socket (the listen call is guarded to
// direct execution) — that's what lets this contract test stay hermetic.
describe("service route table", () => {
  it("serves GET /health with the service identity", () => {
    const resolution = resolveRoute(routes, "GET", "/health");
    expect(resolution.kind).toBe("ok");
    if (resolution.kind !== "ok") return;
    expect(resolution.response.status).toBe(200);
    expect(resolution.response.body).toEqual({
      status: "ok",
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
    });
  });

  it("rejects non-GET methods on /health with 405 semantics", () => {
    expect(resolveRoute(routes, "PUT", "/health").kind).toBe("method_not_allowed");
  });
});
