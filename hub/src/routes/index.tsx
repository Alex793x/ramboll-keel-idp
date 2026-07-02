/**
 * `/` — the HOME screen of the Ramboll Developer Hub, wrapped in the shared
 * shell (sidebar + topbar + auth redirect). Thin route: all UI lives in
 * `components/home/HomeScreen`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../components/shell/AppShell";
import { HomeScreen } from "../components/home/HomeScreen";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <AppShell>
      <HomeScreen />
    </AppShell>
  );
}
