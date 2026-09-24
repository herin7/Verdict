import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { supabase, supabaseConfigured } from "../../lib/supabase";
import { identify as identifyAnalytics, resetAnalytics, track } from "../../analytics/posthog";
import { getOnboardingDone, setOnboardingDone } from "../../storage";

/**
 * Who is signed in. Supabase owns real sessions (tokens live in SecureStore via
 * lib/supabase).
 */
function useSessionState() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    (async () => {
      setOnboarded(await getOnboardingDone());
      let initialUser: string | null = null;

      if (supabaseConfigured && supabase) {
        const { data } = await supabase.auth.getSession();
        initialUser = data.session?.user?.email ?? data.session?.user?.id ?? null;
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
          setUser(session?.user?.email ?? session?.user?.id ?? null);
        });
        unsubscribe = () => sub.subscription.unsubscribe();
      }

      setUser(initialUser);
      setReady(true);
    })();

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (user) identifyAnalytics(user);
  }, [user]);

  const signIn = useCallback(async (email: string) => {
    setUser(email);
  }, []);

  const signOut = useCallback(async () => {
    track("auth_logout");
    if (supabaseConfigured && supabase) await supabase.auth.signOut();
    resetAnalytics();
    setUser(null);
  }, []);

  const completeOnboarding = useCallback(async () => {
    await setOnboardingDone();
    track("onboarding_completed");
    setOnboarded(true);
  }, []);

  return { ready, user, onboarded, signIn, signOut, completeOnboarding };
}

const SessionContext = createContext<ReturnType<typeof useSessionState> | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  return <SessionContext.Provider value={useSessionState()}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}
