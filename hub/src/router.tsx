/**
 * TanStack Start router entry. The Start plugin imports `getRouter` from here to
 * build the router on both the server (SSR) and the client (hydration).
 */
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { color, font } from "./design/tokens";

function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: color.pageBg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        fontFamily: font.sans,
        textAlign: "center",
        padding: 32,
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          letterSpacing: "0.24em",
          color: color.cyan300,
        }}
      >
        404 · NOT FOUND
      </div>
      <h1
        style={{
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          margin: 0,
          color: color.white,
        }}
      >
        That page does not exist.
      </h1>
      <a
        href="/"
        style={{
          marginTop: 12,
          padding: "13px 28px",
          borderRadius: 9999,
          background: color.cyan500,
          color: color.white,
          fontSize: 14.5,
          fontWeight: 800,
          textDecoration: "none",
        }}
      >
        Back to control room
      </a>
    </div>
  );
}

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
  });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
