import { useEffect } from "react";
import { Stack, usePathname, useRouter } from "expo-router";
import { ThemeProvider, DarkTheme, DefaultTheme } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SessionProvider, useSession } from "@/features/auth/session";
import { InboxProvider } from "@/features/inbox/inbox";
import { usePushNavigation } from "@/features/notifications/push";
import { colors, fonts, statusBarStyle } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

const navigationTheme = {
  ...(statusBarStyle === "light" ? DarkTheme : DefaultTheme),
  colors: {
    ...(statusBarStyle === "light" ? DarkTheme : DefaultTheme).colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ShareIntentProvider options={{ resetOnBackground: true }}>
            <ThemeProvider value={navigationTheme}>
              <SessionProvider>
                <RootNavigator />
              </SessionProvider>
            </ThemeProvider>
          </ShareIntentProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

function RootNavigator() {
  const session = useSession();
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const ready = fontsLoaded && session.ready;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  const signedIn = session.onboarded && Boolean(session.user);

  const stack = (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.bold, fontSize: 17 },
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={!session.onboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={session.onboarded && !session.user}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="item/[id]" options={{ title: "" }} />
        <Stack.Screen name="incoming" options={{ headerShown: false, animation: "fade" }} />
        <Stack.Screen name="profile" options={{ title: "You" }} />
        <Stack.Screen name="retake" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      </Stack.Protected>
    </Stack>
  );

  return (
    <>
      <StatusBar style={statusBarStyle} />
      {signedIn && session.user ? (
        <InboxProvider key={session.user} user={session.user}>
          <PushNavigation />
          <ShareNavigation />
          {stack}
        </InboxProvider>
      ) : (
        stack
      )}
    </>
  );
}

/**
 * Share sheet → /incoming. On Android the shared text/image arrives through
 * expo-share-intent's state (there is no URL for +native-intent to rewrite),
 * on a cold start and when the app was already open alike. Only mounted while
 * signed in.
 */
function ShareNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const { hasShareIntent } = useShareIntentContext();
  useEffect(() => {
    if (hasShareIntent && pathname !== "/incoming") router.push("/incoming");
  }, [hasShareIntent, pathname, router]);
  return null;
}

/** Push taps → item screen. Only mounted while signed in. */
function PushNavigation() {
  usePushNavigation();
  return null;
}
