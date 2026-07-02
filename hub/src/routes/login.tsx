/**
 * `/login` — Sign-in screen of the Ramboll Developer Hub design.
 * Ported exactly from `Ramboll Developer Hub.dc.html` lines 36–59.
 *
 * "Continue with Microsoft" is a mock SSO stand-in: it signs in a fixed
 * Entra ID identity through the existing mock-auth session hook, then
 * navigates to `/`. Already-signed-in visitors are redirected to `/`.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "../hooks/useSession";
import { color, font } from "../design/tokens";
import "../components/shell/shell.css";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const SSO_EMAIL = "kristoffer.pedersen@ramboll.com";

function LoginPage() {
  const { session, ready, signIn } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && session) {
      void navigate({ to: "/" });
    }
  }, [ready, session, navigate]);

  function handleSignIn() {
    const result = signIn(SSO_EMAIL, "sso");
    if (result.ok) {
      void navigate({ to: "/" });
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: color.pageBg,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: font.sans,
        color: color.body,
      }}
    >
      {/* Ambient layer: drifting orbs + masked grid (always on) */}
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          left: -260,
          top: -320,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(0,152,235,0.16) 0%, rgba(0,152,235,0) 62%)",
          animation: "driftA 16s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          right: -220,
          bottom: -300,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(5,50,110,0.55) 0%, rgba(5,50,110,0) 65%)",
          animation: "driftB 20s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(155,173,197,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(155,173,197,0.05) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 45%, black 30%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 45%, black 30%, transparent 100%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          animation: "fadeUp 0.9s cubic-bezier(0.2,0.7,0.2,1) both",
          padding: 32,
        }}
      >
        <img
          src="/assets/ramboll-logo-white.png"
          alt="Ramboll"
          style={{ height: 42, width: "auto", marginBottom: 40 }}
        />
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.28em",
            color: color.cyan300,
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          Digital Product Engineering
        </div>
        <h1
          style={{
            fontSize: 60,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.04,
            margin: "0 0 18px",
            color: color.white,
            textWrap: "balance",
          }}
        >
          Developer Hub
        </h1>
        <p
          style={{
            fontSize: 18,
            lineHeight: 1.55,
            color: color.muted,
            maxWidth: "44ch",
            margin: "0 0 44px",
          }}
        >
          Find what exists. Understand how it works. Start new work correctly —
          one control room for building software at Ramboll.
        </p>
        <button
          type="button"
          className="rdh-shell-signin"
          onClick={handleSignIn}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 34px",
            borderRadius: 9999,
            border: "none",
            color: color.white,
            fontFamily: font.sans,
            fontSize: 16,
            fontWeight: 800,
            cursor: "pointer",
            animation: "ringPulse 2.6s ease-out infinite",
          }}
        >
          <span
            style={{
              display: "grid",
              gridTemplateColumns: "8px 8px",
              gridTemplateRows: "8px 8px",
              gap: 2,
            }}
          >
            <span style={{ background: "#fff" }} />
            <span style={{ background: "#fff" }} />
            <span style={{ background: "#fff" }} />
            <span style={{ background: "#fff" }} />
          </span>
          Continue with Microsoft
        </button>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: color.dim,
            marginTop: 20,
            letterSpacing: "0.1em",
          }}
        >
          SSO · ENTRA ID · RAMBOLL.COM ACCOUNTS ONLY
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 28,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            letterSpacing: "0.22em",
            color: color.faint,
          }}
        >
          INTERNAL PLATFORM · V0.1 MVP
        </div>
      </div>
    </div>
  );
}
