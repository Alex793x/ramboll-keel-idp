/**
 * Mock authentication (SPEC §4) — a documented stand-in for Ramboll OIDC.
 *
 * Rule: any `@ramboll.com` email with a non-empty password authenticates. The
 * session is stored client-side (localStorage). In production this module would
 * be replaced by an OIDC redirect/callback flow; the rest of the app only depends
 * on {@link getSession} / {@link Session}, so the swap is isolated.
 *
 * The validation + session-shape logic is pure and unit-tested; the storage
 * helpers are guarded so they no-op in non-browser (SSR/test) contexts.
 */

const STORAGE_KEY = "keel.session";
const ALLOWED_DOMAIN = "@ramboll.com";

export interface Session {
  email: string;
  /** Display name derived from the email local-part. */
  name: string;
  signedInAt: string;
}

export interface CredentialError {
  ok: false;
  reason: string;
}
export type CredentialResult = { ok: true; session: Session } | CredentialError;

/** Is this a well-formed Ramboll email? (case-insensitive domain match). */
export function isRambollEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  // Must have a non-empty local part and end with the allowed domain.
  if (!trimmed.endsWith(ALLOWED_DOMAIN)) {
    return false;
  }
  const local = trimmed.slice(0, -ALLOWED_DOMAIN.length);
  return local.length > 0 && !local.includes("@") && !local.includes(" ");
}

/** Pure credential check + session minting. No side effects. */
export function authenticate(email: string, password: string): CredentialResult {
  if (!isRambollEmail(email)) {
    return { ok: false, reason: "Use your @ramboll.com email address." };
  }
  if (password.trim().length === 0) {
    return { ok: false, reason: "Password is required." };
  }
  const normalized = email.trim();
  return {
    ok: true,
    session: {
      email: normalized,
      name: deriveName(normalized),
      signedInAt: new Date().toISOString(),
    },
  };
}

/** Turn `anya.sorensen@ramboll.com` into `Anya Sorensen`. */
export function deriveName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// ── Storage (browser-only; no-ops under SSR/tests without localStorage) ──────

function storage(): Storage | null {
  try {
    // Access via `window` explicitly: Node 26 defines a global `localStorage` that is
    // non-functional without `--localstorage-file` and shadows jsdom's working one in tests.
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function getSession(): Session | null {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  storage()?.removeItem(STORAGE_KEY);
}
