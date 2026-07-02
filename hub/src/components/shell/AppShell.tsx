/**
 * <AppShell> — the signed-in chrome (sidebar + topbar + scroll area) that
 * every authenticated screen wraps its content in.
 * Layout ported exactly from `Ramboll Developer Hub.dc.html` lines 61–116.
 *
 * Redirects to `/login` when there is no session (same pattern as the
 * existing routes: effect-driven navigate + guarded render).
 */
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "../../hooks/useSession";
import { color, font } from "../../design/tokens";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import "./shell.css";

export function AppShell({ children }: { children: ReactNode }) {
  const { session, ready } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !session) {
      void navigate({ to: "/login" });
    }
  }, [ready, session, navigate]);

  if (ready && !session) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: color.pageBg,
        fontFamily: font.sans,
        color: color.body,
      }}
    >
      <Sidebar email={session?.email ?? null} />
      <main
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Topbar />
        <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
