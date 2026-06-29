/**
 * TanStack Start router entry. The Start plugin imports `getRouter` from here to
 * build the router on both the server (SSR) and the client (hydration).
 */
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultNotFoundComponent: () => (
      <div className="rb-card rb-center">
        <h2>Not found</h2>
        <p className="rb-muted">That page does not exist.</p>
        <a className="rb-btn rb-btn--secondary" href="/">
          Back to catalog
        </a>
      </div>
    ),
  });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
