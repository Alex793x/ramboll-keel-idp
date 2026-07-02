/**
 * Root route — bare document shell for the Ramboll Developer Hub design.
 * Loads the design's Google Fonts + global stylesheet and renders the matched
 * route; screens provide their own chrome (sidebar/topbar), so there is no
 * shared header/footer here.
 */
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import globalCss from "../design/global.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Ramboll Developer Hub" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
      { rel: "stylesheet", href: globalCss },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
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
