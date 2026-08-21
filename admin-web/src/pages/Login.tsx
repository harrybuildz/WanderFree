// Sign-in. Ordinary Supabase email/password — the same Auth users the mobile
// app uses. Being able to sign in proves nothing on its own; the allowlist
// check in admin-api decides access, and its refusal is surfaced here.

import { useState, type FormEvent } from "react";

import { useAuth } from "../auth";
import { supabase } from "../supabase";

export function Login() {
  const { deniedReason, session, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) setError(signInError.message);
    setBusy(false);
  }

  // Signed in, but admin-api turned them away.
  if (session && deniedReason) {
    return (
      <div className="login-wrap">
        <div className="card card-pad login-card">
          <h1>Not authorised</h1>
          <p className="sub">Signed in as {session.user.email}</p>
          <div className="banner danger" style={{ marginBottom: 18 }}>
            {deniedReason}
          </div>
          <button className="primary" style={{ width: "100%" }} onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <form className="card card-pad login-card" onSubmit={onSubmit}>
        <h1>
          Wander<span style={{ color: "var(--primary)" }}>Freely</span>
        </h1>
        <p className="sub">Internal admin console</p>

        {error && (
          <div className="banner danger" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button className="primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
