/**
 * `/projects` — the PROJECTS screen of the Ramboll Developer Hub, wrapped in
 * the shared shell (sidebar + topbar + auth redirect). Thin route: all UI
 * lives in `components/projects/ProjectsScreen`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../components/shell/AppShell";
import { ProjectsScreen } from "../components/projects/ProjectsScreen";

export const Route = createFileRoute("/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  return (
    <AppShell>
      <ProjectsScreen />
    </AppShell>
  );
}
