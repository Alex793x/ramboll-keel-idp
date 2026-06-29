/**
 * `/new` — hosts the project wizard. Accepts an optional `?blueprint=` search
 * param (set by the catalog CTA). Requires a signed-in session; redirects to
 * `/login` otherwise.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Wizard } from "../components/Wizard";
import { useSession } from "../hooks/useSession";

interface NewSearch {
  blueprint?: string;
}

export const Route = createFileRoute("/new")({
  validateSearch: (search: Record<string, unknown>): NewSearch => ({
    blueprint: typeof search.blueprint === "string" ? search.blueprint : undefined,
  }),
  component: NewProjectPage,
});

function NewProjectPage() {
  const { blueprint } = Route.useSearch();
  const { session, ready } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !session) {
      void navigate({ to: "/login" });
    }
  }, [ready, session, navigate]);

  if (ready && !session) {
    return (
      <div className="rb-card rb-center">
        <p className="rb-muted">Please sign in to start a project.</p>
      </div>
    );
  }

  return (
    <>
      <h1>New project</h1>
      <p className="rb-muted">
        Pick a department and owners, fill in the details, then initialize a
        standards-compliant repository.
      </p>
      <Wizard blueprint={blueprint ?? "python-service"} />
    </>
  );
}
