/**
 * `/knowledge` — Knowledge Base home. Thin route: wraps `KbHomeScreen`
 * in the shared `AppShell`. When the doc-reader child route
 * (`/knowledge/$docId`) matches, this renders its outlet instead so the
 * shell chrome is mounted exactly once.
 */
import { Outlet, createFileRoute, useChildMatches, useNavigate } from "@tanstack/react-router";
import { AppShell } from "../components/shell/AppShell";
import { KbHomeScreen } from "../components/kb/KbHomeScreen";

export const Route = createFileRoute("/knowledge")({
  component: KnowledgePage,
});

function KnowledgePage() {
  const navigate = useNavigate();
  const hasChild = useChildMatches().length > 0;
  return (
    <AppShell>
      {hasChild ? (
        <Outlet />
      ) : (
        <KbHomeScreen
          onOpenDoc={(id) =>
            void navigate({ to: "/knowledge/$docId", params: { docId: id } })
          }
        />
      )}
    </AppShell>
  );
}
