/**
 * Pure HTTP routing logic — no sockets, no I/O, no Node APIs. Everything here
 * is a deterministic function of its inputs, which is what makes it fully
 * property-testable (see `tests/routes.test.ts`, powered by fast-check). The
 * impure wiring (actual `node:http` server) lives in `server.ts`.
 */

/** A JSON response descriptor produced by a route handler. */
export interface JsonResponse {
  status: number;
  body: Record<string, unknown>;
}

/** One entry in the route table. */
export interface Route {
  method: string;
  path: string;
  handle: () => JsonResponse;
}

/** The outcome of resolving a request against the route table. */
export type Resolution =
  | { kind: "ok"; response: JsonResponse }
  | { kind: "method_not_allowed"; allowed: string[] }
  | { kind: "not_found" };

/**
 * Canonicalise a request path: drop query/fragment, collapse slash runs,
 * ensure a leading slash, strip the trailing slash (except for the root).
 *
 * Properties (encoded in the fast-check tests): the result always starts with
 * `/`, never contains `//`, `?` or `#`, never ends with `/` (unless it *is*
 * `/`), and the function is idempotent.
 */
export function normalizePath(rawPath: string): string {
  const withoutQuery = rawPath.split(/[?#]/, 1)[0] ?? "";
  const collapsed = withoutQuery.replace(/\/{2,}/g, "/");
  const prefixed = collapsed.startsWith("/") ? collapsed : `/${collapsed}`;
  if (prefixed.length > 1 && prefixed.endsWith("/")) {
    return prefixed.slice(0, -1);
  }
  return prefixed;
}

/**
 * Resolve a request against the route table.
 *
 * Paths are compared after `normalizePath` on both sides; methods are
 * case-insensitive. A path with routes but no matching method resolves to
 * `method_not_allowed` (HTTP 405 + `Allow`), an unknown path to `not_found`.
 * Total: never throws for any string inputs.
 */
export function resolveRoute(
  routes: readonly Route[],
  method: string,
  rawPath: string,
): Resolution {
  const path = normalizePath(rawPath);
  const wanted = method.toUpperCase();

  const samePath = routes.filter((route) => normalizePath(route.path) === path);
  if (samePath.length === 0) {
    return { kind: "not_found" };
  }

  const match = samePath.find((route) => route.method.toUpperCase() === wanted);
  if (!match) {
    return {
      kind: "method_not_allowed",
      allowed: samePath.map((route) => route.method.toUpperCase()),
    };
  }
  return { kind: "ok", response: match.handle() };
}
