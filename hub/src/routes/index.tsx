/**
 * `/` — the catalog (SPEC §4): a hero + one card per blueprint from
 * `GET /api/blueprints`. The Python blueprint is live; anything else renders
 * "coming soon". CTA → `/new`.
 */
import { Link, createFileRoute } from "@tanstack/react-router";
import { getApi } from "../lib/api";
import { useAsync } from "../hooks/useAsync";
import type { Blueprint } from "../lib/types";

export const Route = createFileRoute("/")({
  component: CatalogPage,
});

/** A blueprint is live iff it is the Python golden path. */
export function isBlueprintLive(b: Pick<Blueprint, "name">): boolean {
  return b.name === "python-service";
}

function CatalogPage() {
  const { data, loading, error } = useAsync<Blueprint[]>(
    () => getApi().listBlueprints(),
    [],
  );

  return (
    <>
      <section className="rb-hero">
        <h1>Lay the keel of your next service</h1>
        <p>
          Keel is the project-initialization layer of the Ramboll Developer
          Platform. Pick a blueprint, choose the department and owners, and get a
          standards-compliant GitHub repository that is green from its first
          commit.
        </p>
        <div className="rb-row" style={{ marginTop: 16 }}>
          <Link to="/new" className="rb-btn rb-btn--primary">
            Start a new project →
          </Link>
          <Link to="/projects" className="rb-btn rb-btn--secondary">
            View projects
          </Link>
        </div>
      </section>

      <h2>Blueprints</h2>
      {loading ? <p className="rb-muted">Loading blueprints…</p> : null}
      {error ? (
        <div className="rb-card rb-card--muted">
          <p className="rb-error">Could not reach the Keel API: {error.message}</p>
          <p className="rb-muted">
            Start the Rust API with <span className="rb-mono">cargo run -p keel-api</span>{" "}
            (default <span className="rb-mono">:8787</span>).
          </p>
        </div>
      ) : null}

      {data ? (
        <div className="rb-grid">
          {data.map((bp) => (
            <BlueprintCard key={bp.name} blueprint={bp} />
          ))}
        </div>
      ) : null}
    </>
  );
}

function BlueprintCard({ blueprint }: { blueprint: Blueprint }) {
  const live = isBlueprintLive(blueprint);
  return (
    <div className={live ? "rb-card" : "rb-card rb-card--muted"}>
      <div className="rb-row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>{blueprint.title}</h3>
        <span className={live ? "rb-pill" : "rb-pill rb-pill--soon"}>
          {live ? `v${blueprint.version}` : "Coming soon"}
        </span>
      </div>
      <p className="rb-muted" style={{ minHeight: "3em" }}>
        {blueprint.description}
      </p>
      {live ? (
        <Link
          to="/new"
          search={{ blueprint: blueprint.name }}
          className="rb-btn rb-btn--primary"
        >
          Use this blueprint →
        </Link>
      ) : (
        <button type="button" className="rb-btn rb-btn--secondary" disabled>
          Not available yet
        </button>
      )}
    </div>
  );
}
