/**
 * `/projects/$projectId` — the project dashboard (SPEC §18.3). Thin route:
 * all UI lives in `components/project/ProjectScreen`. Renders inside the
 * parent `/projects` route's AppShell (same nesting idiom as
 * `knowledge.$docId`), so the shell chrome is mounted exactly once.
 * Unknown ids are NOT redirected: the API's 404 drives the screen's
 * "not in the catalog" state.
 */
import { createFileRoute } from "@tanstack/react-router";
import { ProjectScreen } from "../components/project/ProjectScreen";

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  return <ProjectScreen id={projectId} />;
}
