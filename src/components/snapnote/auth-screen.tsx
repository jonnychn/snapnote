import { useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";

type Mode = "in" | "up";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInfo("");
    const nextEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setError("Enter the email you want on this account.");
      return;
    }
    if (password.length < 6) {
      setError("Use at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      const supabase = getSupabase();
      if (mode === "up") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: nextEmail,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (signUpError) throw signUpError;
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          setMode("in");
          setInfo("That email already has an account. Sign in instead.");
          return;
        }
        if (!data.session) {
          setMode("in");
          setInfo("Check your inbox and confirm this email, then sign in.");
        }
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: nextEmail,
        password,
      });
      if (signInError) throw signInError;
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pt-8">
      <p className="text-xs uppercase tracking-widest text-muted">On the go</p>
      <h1 className="font-display text-4xl">Snap Notes</h1>
      <p className="mt-2 max-w-sm text-muted">
        Sign in so the photo, the price, and the reason stay on your account.
      </p>
      <form className="mt-8 flex flex-col gap-3" onSubmit={(event) => void onSubmit(event)}>
        <label>
          <span className="mb-1 block text-sm text-muted">Email</span>
          <input
            className="field"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Password</span>
          <input
            className="field"
            type="password"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
          />
        </label>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="text-sm text-muted" role="status">
            {info}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary press mt-2" disabled={busy}>
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>
      <button
        type="button"
        className="press mt-4 min-h-11 self-start text-sm text-muted"
        onClick={() => {
          setMode((current) => (current === "in" ? "up" : "in"));
          setError("");
          setInfo("");
        }}
      >
        {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </main>
  );
}

function authMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "Couldn't sign in.";
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  const msg = raw.toLowerCase();
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return "Confirm that email first. Check your inbox, then sign in.";
  }
  if (code === "invalid_credentials" || msg.includes("invalid login")) {
    return "That email and password don't match.";
  }
  if (msg.includes("already registered") || code === "user_already_exists") {
    return "That email already has an account. Sign in instead.";
  }
  if (msg.includes("password")) return "Use at least 6 characters.";
  return raw;
}
