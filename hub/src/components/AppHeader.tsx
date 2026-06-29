import { Link, useNavigate } from "@tanstack/react-router";
import { useSession } from "../hooks/useSession";

/** Navy header bar with the brand wordmark, nav, and current user / sign-out. */
export function AppHeader() {
  const { session, signOut } = useSession();
  const navigate = useNavigate();

  return (
    <header className="rb-header">
      <div className="rb-header__inner">
        <Link to="/" className="rb-brand">
          Ramboll Developer Platform <span className="rb-brand__dot">·</span> Keel
        </Link>
        <nav className="rb-nav">
          <Link to="/">Catalog</Link>
          <Link to="/new">New project</Link>
          <Link to="/projects">Projects</Link>
          {session ? (
            <>
              <span className="rb-nav__user">{session.name}</span>
              <button
                type="button"
                className="rb-btn rb-btn--ghost"
                style={{ color: "var(--rb-panel)" }}
                onClick={() => {
                  signOut();
                  void navigate({ to: "/login" });
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link to="/login">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
