import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { supabase, supabaseConfigured } from "../../lib/supabase";
import { identify as identifyAnalytics, resetAnalytics, track } from "../../analytics/posthog";
import type { BuyerProfile } from "../profile/questions";
import { readProfile, uploadProfile, writeProfile } from "../profile/store";

/**
 * Who is signed in. Supabase owns real sessions (tokens live in SecureStore via
 * lib/supabase). Onboarding is done once there is a buyer profile; it is
 * answered before sign-in, then pushed to the server whenever someone signs in.
 */
function useSessionState() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [profile, setProfile] = useState<BuyerProfile | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    (async () => {
      setProfile(await readProfile());
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

  // Every sign-in/launch re-sends the device copy, so an offline save catches up.
  // ponytail: last-write-wins from this device; pull GET /profile first if profiles ever get edited elsewhere.
  useEffect(() => {
    if (user && profile) uploadProfile(profile).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /** Onboarding, a retake, or a calibration answer. Device first, then the server if signed in. */
  const saveProfile = useCallback(
    async (next: BuyerProfile) => {
      await writeProfile(next);
      setProfile(next);
      if (user) await uploadProfile(next).catch(() => {});
    },
    [user]
  );

  const completeOnboarding = useCallback(
    async (next: BuyerProfile) => {
      await saveProfile(next);
      track("onboarding_completed", { spendStyle: next.spendStyle, friction: next.friction });
    },
    [saveProfile]
  );

  return { ready, user, profile, onboarded: Boolean(profile), signIn, signOut, saveProfile, completeOnboarding };
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
