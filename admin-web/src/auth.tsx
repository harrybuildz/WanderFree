// Session state for the console.
//
// Two-stage: Supabase tells us there's a signed-in user, then admin-api tells
// us whether that user is on the allowlist. Both must hold before the console
// renders, so a beta user who finds this URL and signs in with their app
// credentials gets a clear refusal rather than a broken-looking shell.

import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, api } from "./api";
import { supabase } from "./supabase";

interface AdminIdentity {
  email: string;
  displayName: string | null;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  admin: AdminIdentity | null;
  /** Set when there IS a session but it isn't allowlisted. */
  deniedReason: string | null;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [deniedReason, setDeniedReason] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;

    if (!session) {
      setAdmin(null);
      setDeniedReason(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    api
      .me()
      .then((r) => {
        if (!active) return;
        setAdmin(r.admin);
        setDeniedReason(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setAdmin(null);
        setDeniedReason(
          err instanceof ApiError
            ? err.message
            : "Could not reach the admin API. Is it running on port 4000?",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      admin,
      deniedReason,
      signOut: async () => {
        await supabase.auth.signOut();
        setAdmin(null);
        setDeniedReason(null);
      },
    }),
    [loading, session, admin, deniedReason],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
