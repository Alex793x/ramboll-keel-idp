/**
 * Root route — the document shell + Ramboll-branded app chrome (SPEC §8):
 * navy header bar "Ramboll Developer Platform · Keel", gold rule, footer tagline.
 */
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import tokensCss from "../styles/tokens.css?url";
import { AppHeader } from "../components/AppHeader";
import { AppFooter } from "../components/AppFooter";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Ramboll Developer Platform · Keel" },
      {
        name: "description",
        content:
          "Keel — self-service project initialization for the Ramboll Developer Platform.",
      },
    ],
    links: [{ rel: "stylesheet", href: tokensCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <div className="rb-app">
        <AppHeader />
        <main className="rb-main">
          <Outlet />
        </main>
        <AppFooter />
      </div>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
