/**
 * `/projects` — a table of initialized projects from `GET /api/projects`.
 */
import { Link, createFileRoute } from "@tanstack/react-router";
import { getApi } from "../lib/api";
import { useAsync } from "../hooks/useAsync";
import type { InitOutcome } from "../lib/types";

export const Route = createFileRoute("/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const { data, loading, error } = useAsync<InitOutcome[]>(
    () => getApi().listProjects(),
    [],
  );

  return (
    <>
      <div className="rb-row" style={{ justifyContent: "space-between" }}>
        <h1>Projects</h1>
        <Link to="/new" className="rb-btn rb-btn--primary">
          New project →
        </Link>
      </div>

      {loading ? <p className="rb-muted">Loading projects…</p> : null}
      {error ? (
        <div className="rb-card rb-card--muted">
          <p className="rb-error">Could not reach the Keel API: {error.message}</p>
        </div>
      ) : null}

      {data && data.length === 0 ? (
        <div className="rb-card rb-center">
          <p className="rb-muted">No projects yet.</p>
          <Link to="/new" className="rb-btn rb-btn--primary">
            Create the first one →
          </Link>
        </div>
      ) : null}

      {data && data.length > 0 ? (
        <table className="rb-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Repository</th>
              <th>Default branch</th>
              <th>Branches</th>
              <th>Blueprint</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.catalog_id}>
                <td className="rb-mono">{p.project}</td>
                <td>
                  <a href={p.repo.html_url} target="_blank" rel="noreferrer">
                    {p.repo.owner}/{p.repo.name}
                  </a>
                </td>
                <td className="rb-mono">{p.repo.default_branch}</td>
                <td className="rb-mono">{p.repo.branches.join(", ")}</td>
                <td>v{p.blueprint_version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
