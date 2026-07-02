/**
 * `/knowledge/$docId` — doc reader. Thin route: resolves the doc from
 * `DOCS` and renders `DocReader` (inside the parent `/knowledge` route's
 * AppShell). Unknown ids redirect back to `/knowledge`, as in the design
 * (no doc selected → KB home).
 */
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { DOCS } from "../lib/docs-data";
import { DocReader } from "../components/kb/DocReader";

export const Route = createFileRoute("/knowledge/$docId")({
  beforeLoad: ({ params }) => {
    if (!DOCS.some((d) => d.id === params.docId)) {
      throw redirect({ to: "/knowledge" });
    }
  },
  component: DocPage,
});

function DocPage() {
  const { docId } = Route.useParams();
  const navigate = useNavigate();
  const doc = DOCS.find((d) => d.id === docId);
  if (!doc) return null; // unreachable: beforeLoad redirects unknown ids
  return <DocReader doc={doc} onBack={() => void navigate({ to: "/knowledge" })} />;
}
