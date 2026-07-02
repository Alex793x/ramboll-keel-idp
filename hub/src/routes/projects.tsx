/**
 * `/projects` — the PROJECTS screen of the Ramboll Developer Hub, wrapped in
 * the shared shell (sidebar + topbar + auth redirect). Thin route: all UI
 * lives in `components/projects/ProjectsScreen`. When the dashboard child
 * route (`/projects/$projectId`) matches, this renders its outlet instead so
 * the shell chrome is mounted exactly once (same idiom as `/knowledge`).
 */
import { Outlet, createFileRoute, useChildMatches } from "@tanstack/react-router";
import { AppShell } from "../components/shell/AppShell";
import { ProjectsScreen } from "../components/projects/ProjectsScreen";

export const Route = createFileRoute("/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const hasChild = useChildMatches().length > 0;
  return (
    <AppShell>
      {hasChild ? <Outlet /> : <ProjectsScreen />}
    </AppShell>
  );
}
