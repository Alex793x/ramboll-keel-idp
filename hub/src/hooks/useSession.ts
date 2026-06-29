import { useCallback, useEffect, useState } from "react";
import {
  authenticate,
  clearSession,
  getSession,
  saveSession,
  type CredentialResult,
  type Session,
} from "../lib/auth";

/**
 * Client-side session hook over the mock auth module. Reads the stored session on
 * mount (client only — SSR renders signed-out, then hydrates).
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(getSession());
    setReady(true);
  }, []);

  const signIn = useCallback((email: string, password: string): CredentialResult => {
    const result = authenticate(email, password);
    if (result.ok) {
      saveSession(result.session);
      setSession(result.session);
    }
    return result;
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  return { session, ready, signIn, signOut };
}
