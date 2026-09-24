import { supabase, supabaseConfigured } from "../../lib/supabase";
import { track } from "../../analytics/posthog";

export type AuthMode = "signin" | "signup";
export type AuthResult = { email: string } | { needsConfirmation: true };

/** Email/password auth. Throws an Error with a message that is safe to show. */
export async function authenticate(mode: AuthMode, rawEmail: string, password: string): Promise<AuthResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !password) throw new Error("Enter your email and password.");

  if (password.length < 6) throw new Error("Password needs at least 6 characters.");

  if (!supabaseConfigured || !supabase) {
    if (!__DEV__) throw new Error("Sign-in is temporarily unavailable. Try again soon.");
    track(mode === "signin" ? "auth_login" : "auth_signup", { method: "local-dev" });
    return { email };
  }

  if (mode === "signin") {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    track("auth_login");
    return { email: data.user?.email ?? email };
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  if (!data.session) return { needsConfirmation: true };
  track("auth_signup");
  return { email: data.user?.email ?? email };
}
