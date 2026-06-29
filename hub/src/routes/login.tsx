/**
 * `/login` — mock auth (SPEC §4). Any `@ramboll.com` email + non-empty password
 * signs in; anything else is rejected. Documented OIDC stand-in (see lib/auth.ts).
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useSession } from "../hooks/useSession";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = signIn(email, password);
    if (result.ok) {
      void navigate({ to: "/" });
    } else {
      setError(result.reason);
    }
  }

  return (
    <div className="rb-login">
      <div className="rb-card">
        <h1>Sign in</h1>
        <p className="rb-muted">
          Use your Ramboll account. This is a mock sign-in standing in for Ramboll
          OIDC — any <span className="rb-mono">@ramboll.com</span> email with a
          password works.
        </p>
        <form onSubmit={handleSubmit} noValidate>
          <div className="rb-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="firstname.lastname@ramboll.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="rb-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? (
            <p className="rb-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="rb-btn rb-btn--primary">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
