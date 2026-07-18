import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from "@expo-google-fonts/instrument-serif";
import { Arimo_400Regular, Arimo_500Medium, Arimo_600SemiBold, Arimo_700Bold } from "@expo-google-fonts/arimo";
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import {
  canDrawOverlays,
  hideBubble,
  isBubbleVisible,
  isOverlaySupported,
  setBubbleHot,
  showBubble,
} from "verdict-overlay";
import {
  addAppOpenedListener,
  addLeftShoppingAppListener,
  addScreenTextListener,
  isAccessibilityServiceEnabled,
  isAccessibilitySupported,
  setWatchlist,
} from "verdict-accessibility";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { LoginScreen } from "./src/screens/LoginScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { ReportScreen } from "./src/screens/ReportScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { PaymentRewardsScreen } from "./src/screens/PaymentRewardsScreen";
import { OverlaySettingsScreen } from "./src/screens/OverlaySettingsScreen";
import { MissionsScreen } from "./src/screens/MissionsScreen";
import { DirectSearchScreen } from "./src/screens/DirectSearchScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { BottomTabBar, type TabId } from "./src/components/BottomTabBar";
import { colors } from "./src/theme";
import { WATCHED_PACKAGE_NAMES } from "./src/overlayApps";
import { detectProductPage } from "./src/detectProductPage";
import {
  deleteReport,
  getOnboardingDone,
  getSavedReports,
  getScanCount,
  incrementScanCount,
  makeReportId,
  saveReport,
  setOnboardingDone,
  setScanCount,
} from "./src/storage";
import {
  deleteRemoteReport,
  fetchSavedReports,
  fetchScanStats,
  saveRemoteReport,
} from "./src/api/client";
import { supabase, supabaseConfigured } from "./src/lib/supabase";
import { identify as identifyAnalytics, resetAnalytics, track } from "./src/analytics/posthog";
import { consumePendingFullReport } from "./src/panelBridge";
import type { BuyLink, ConsensusReport, ProductIdentity, SavedReport } from "./src/types";

type Screen =
  | "dashboard"
  | "scan"
  | "search"
  | "library"
  | "report"
  | "payments"
  | "overlay"
  | "missions"
  | "profile";

/** The four persistent tab roots - the bottom bar shows only on these; every other Screen is a pushed/detail view. */
const TAB_SCREENS: TabId[] = ["dashboard", "scan", "library", "profile"];

function isTabScreen(s: Screen): s is TabId {
  return (TAB_SCREENS as Screen[]).includes(s);
}

type ScreenTextPayload = { text: string; packageName: string };

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ShareIntentProvider>
          <AppInner />
        </ShareIntentProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

function AppInner() {
  const [fontsLoaded] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    Arimo_400Regular,
    Arimo_500Medium,
    Arimo_600SemiBold,
    Arimo_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  const [authChecked, setAuthChecked] = useState(false);
  const [onboardingDone, setOnboardingDoneState] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  const [view, setView] = useState<Screen>("dashboard");
  const [history, setHistory] = useState<Screen[]>([]);
  const viewRef = useRef<Screen>(view);
  const [current, setCurrent] = useState<SavedReport | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [cameFrom, setCameFrom] = useState<Screen>("scan");
  const [library, setLibrary] = useState<SavedReport[]>([]);
  const [scanCount, setScanCountState] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [screenText, setScreenText] = useState<ScreenTextPayload | null>(null);

  const latestScreenText = useRef<ScreenTextPayload | null>(null);
  const hotDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent || !shareIntent) return;
    const webUrl = (shareIntent as { webUrl?: string }).webUrl;
    const text = (shareIntent as { text?: string }).text;
    const candidate =
      (typeof webUrl === "string" && webUrl) ||
      (typeof text === "string" && text.match(/https?:\/\/\S+/)?.[0]) ||
      null;
    if (candidate) {
      setShareUrl(candidate.trim());
      setScreenText(null);
      switchTab("scan");
      resetShareIntent();
    }
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    (async () => {
      setOnboardingDoneState(await getOnboardingDone());

      if (supabaseConfigured && supabase) {
        const { data } = await supabase.auth.getSession();
        const initialUser = data.session?.user?.email ?? data.session?.user?.id ?? null;
        setUsername(initialUser);
        if (initialUser) identifyAnalytics(initialUser);
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
          const nextUser = session?.user?.email ?? session?.user?.id ?? null;
          setUsername(nextUser);
          if (nextUser) identifyAnalytics(nextUser);
        });
        unsubscribe = () => sub.subscription.unsubscribe();
      }

      setAuthChecked(true);
    })();

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (fontsLoaded && authChecked) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, authChecked]);

  useEffect(() => {
    if (username) {
      refreshLibrary();
      refreshScans();
    }
  }, [username]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Push the current screen onto the back-stack, then switch to `next`.
  // Use this (not setView) for every user-initiated forward navigation so
  // the hardware back button can unwind it below.
  function navigate(next: Screen) {
    setHistory((h) => [...h, viewRef.current]);
    setView(next);
  }

  // Pop the back-stack to the previous screen. Returns false (no-op) when
  // the stack is empty, so callers/handlers can fall back to their own
  // default (e.g. let the hardware back button exit the app on the root).
  function goBack(): boolean {
    if (history.length === 0) return false;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setView(prev);
    return true;
  }

  // Switching tabs on the bottom bar isn't a push - it doesn't grow the
  // back-stack, matching normal tab-bar UX (see the BackHandler fallback
  // below for what happens when back is pressed on a non-Home tab).
  function switchTab(tab: TabId) {
    setView(tab);
  }

  // Android hardware back: navigate the in-app stack instead of always
  // closing the app. Only the true root (dashboard, empty stack) falls
  // through to the default exit behavior. The floating product panel is a
  // separate overlay surface entirely, not part of this stack - its own
  // close/back handling lives in VerdictPanelRoot.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (view === "report") {
        backFromReport();
        return true;
      }
      if (goBack()) return true;
      // No pushed history left. On a non-Home tab, return to Home first
      // (standard tab-bar convention) instead of exiting immediately.
      if (isTabScreen(view) && view !== "dashboard") {
        setView("dashboard");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [view, history]);

  // The floating panel does its own identify+research inside its own
  // surface; when the user taps "open full report" there, it hands the
  // already-fetched report over via panelBridge (same JS instance, separate
  // React tree) and brings MainActivity forward - pick it up here instead of
  // re-identifying/re-researching from scratch.
  const checkPendingFullReport = useCallback(() => {
    const pending = consumePendingFullReport();
    if (!pending) return;
    openReport(pending.report, pending.product, pending.buyLinks, pending.productId);
  }, []);

  // Cold start: the app may have been brought forward specifically to show
  // a report handed off from the panel.
  useEffect(() => {
    if (!username) return;
    checkPendingFullReport();
  }, [username, checkPendingFullReport]);

  // Warm foreground transition: same handoff, but the app was already
  // running when the panel requested it.
  useEffect(() => {
    if (Platform.OS !== "android" || !username) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkPendingFullReport();
    });
    return () => sub.remove();
  }, [username, checkPendingFullReport]);

  // Cast-free shopping overlay: watchlist + auto bubble + tap to research
  useEffect(() => {
    if (Platform.OS !== "android" || !username) return;
    if (!isAccessibilitySupported && !isOverlaySupported) return;

    if (isAccessibilitySupported) {
      setWatchlist(WATCHED_PACKAGE_NAMES);
    }

    const textSub = addScreenTextListener((text, packageName, isProductPage) => {
      latestScreenText.current = { text, packageName };
      if (!isOverlaySupported) return;
      if (!canDrawOverlays()) return;
      if (!isAccessibilityServiceEnabled()) return;
      // Native a11y also drives show/hide; keep RN as backup while app alive.
      if (!isBubbleVisible()) {
        showBubble();
        track("overlay_bubble_shown");
      }
      const hot =
        typeof isProductPage === "boolean" ? isProductPage : detectProductPage(text, packageName);
      // Debounce hot flips - a11y events fire very frequently on scroll.
      if (hotDebounce.current) clearTimeout(hotDebounce.current);
      hotDebounce.current = setTimeout(() => setBubbleHot(hot), 120);
    });

    const leftSub = addLeftShoppingAppListener(() => {
      // Native already soft-hides; keep hot false as backup.
      if (isOverlaySupported) setBubbleHot(false);
    });

    // Fires once per session when a watched shopping app comes to the
    // foreground - the only place that gives us proper visibility into which
    // marketplace app the user actually opened, regardless of whether they
    // ever tap the bubble.
    const openedSub = addAppOpenedListener((packageName) => {
      track("overlay_app_opened", { packageName });
    });

    // Bubble tap is handled entirely natively now (VerdictOverlayService
    // shows the "VerdictPanel" surface directly) - it never needs to reach
    // this JS tree at all, which is what lets the panel appear without
    // AppInner (or MainActivity) ever coming to the foreground.

    return () => {
      if (hotDebounce.current) clearTimeout(hotDebounce.current);
      textSub.remove();
      leftSub.remove();
      openedSub.remove();
    };
  }, [username]);

  async function refreshLibrary() {
    const local = await getSavedReports();
    try {
      const remote = await fetchSavedReports();
      const mapped: SavedReport[] = remote.items
        .filter((i) => i.report)
        .map((i) => ({
          id: i.id,
          savedAt: i.savedAt,
          productId: i.productId,
          product: i.product,
          report: i.report!,
          buyLinks: i.buyLinks ?? [],
        }));
      // Reports saved while offline/db-unavailable have no productId (see
      // openReport/handleToggleSave) and only ever exist in local storage -
      // merge them in rather than discarding them the moment remote returns
      // ANY items, which used to make them silently vanish from the Library
      // UI forever (still sitting in AsyncStorage, just never shown again).
      const remoteProductIds = new Set(mapped.map((m) => m.productId).filter(Boolean));
      const localOnly = local.filter((l) => !l.productId || !remoteProductIds.has(l.productId));
      setLibrary([...mapped, ...localOnly]);
      return;
    } catch {
      // fall through to local cache
    }
    setLibrary(local);
  }

  async function refreshScans() {
    try {
      const stats = await fetchScanStats();
      setScanCountState(stats.count);
      await setScanCount(stats.count);
    } catch {
      setScanCountState(await getScanCount());
    }
  }

  async function handleLogin(name: string) {
    identifyAnalytics(name);
    setUsername(name);
    setHistory([]);
    setView("dashboard");
  }

  async function handleLogout() {
    track("auth_logout");
    if (supabaseConfigured && supabase) await supabase.auth.signOut();
    setUsername(null);
    setHistory([]);
    resetAnalytics();
    if (isOverlaySupported && isBubbleVisible()) hideBubble();
  }

  async function finishOnboarding() {
    await setOnboardingDone();
    setOnboardingDoneState(true);
    track("onboarding_completed");
  }

  async function openReport(
    report: ConsensusReport,
    product: ProductIdentity,
    buyLinks: BuyLink[],
    productId?: string | null
  ) {
    const entry: SavedReport = {
      id: makeReportId(),
      savedAt: Date.now(),
      product,
      report,
      buyLinks,
      productId: productId ?? null,
    };
    setCurrent(entry);
    setIsSaved(false);
    setCameFrom("scan");
    setView("report");
    setScanCountState(await incrementScanCount());
    track("report_viewed", { category: product.category, verdict: report.verdict, score: report.score });
  }

  function openSaved(entry: SavedReport, from: Screen = "library") {
    setCurrent(entry);
    setIsSaved(true);
    setCameFrom(from);
    setView("report");
  }

  async function handleToggleSave() {
    if (!current) return;
    if (isSaved) {
      if (current.productId) {
        try {
          await deleteRemoteReport(current.productId);
        } catch {
          /* local fallback */
        }
      }
      await deleteReport(current.id);
      setIsSaved(false);
      track("report_deleted", { category: current.product.category });
    } else {
      if (current.productId) {
        try {
          await saveRemoteReport(current.productId);
        } catch {
          /* local fallback */
        }
      }
      await saveReport(current);
      setIsSaved(true);
      track("report_saved", { category: current.product.category });
    }
    refreshLibrary();
  }

  async function handleDelete(id: string) {
    const item = library.find((r) => r.id === id);
    if (item?.productId) {
      try {
        await deleteRemoteReport(item.productId);
      } catch {
        /* ignore */
      }
    }
    await deleteReport(id);
    track("report_deleted", { category: item?.product.category });
    refreshLibrary();
  }

  function backFromReport() {
    setView(cameFrom);
    setCurrent(null);
  }

  function clearScanInputs() {
    setShareUrl(null);
    setScreenText(null);
  }

  if (!fontsLoaded || !authChecked) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!onboardingDone) {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        <OnboardingScreen onDone={finishOnboarding} />
      </View>
    );
  }

  if (!username) {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        <LoginScreen onLogin={handleLogin} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <View style={styles.screenArea}>
        {view === "dashboard" && (
          <DashboardScreen
            username={username}
            scanCount={scanCount}
            savedCount={library.length}
            recent={library}
            onScan={() => {
              clearScanInputs();
              switchTab("scan");
            }}
            onSearch={() => navigate("search")}
            onLibrary={() => {
              track("library_opened");
              switchTab("library");
            }}
            onPayments={() => navigate("payments")}
            onOverlay={() => navigate("overlay")}
            onMissions={() => navigate("missions")}
            onOpenReport={(entry) => openSaved(entry, "dashboard")}
            onLogout={handleLogout}
          />
        )}

        {view === "search" && <DirectSearchScreen onHome={() => goBack()} />}

        {view === "payments" && <PaymentRewardsScreen onBack={() => goBack()} />}

        {view === "overlay" && <OverlaySettingsScreen onBack={() => goBack()} />}

        {view === "missions" && <MissionsScreen onBack={() => goBack()} />}

        {view === "report" && current && (
          <ReportScreen
            report={current.report}
            product={current.product}
            buyLinks={current.buyLinks}
            isSaved={isSaved}
            onBack={backFromReport}
            onToggleSave={handleToggleSave}
          />
        )}

        {view === "scan" && (
          <ScanScreen
            initialUrl={shareUrl}
            initialScreenText={screenText}
            onReport={(report, product, buyLinks, productId) => {
              clearScanInputs();
              openReport(report, product, buyLinks, productId);
            }}
            onHome={() => {
              clearScanInputs();
              switchTab("dashboard");
            }}
          />
        )}

        {view === "library" && (
          <LibraryScreen
            items={library}
            onOpen={(entry) => {
              track("library_item_opened", { category: entry.product.category });
              openSaved(entry);
            }}
            onDelete={handleDelete}
            onHome={() => switchTab("dashboard")}
          />
        )}

        {view === "profile" && (
          <ProfileScreen
            username={username}
            scanCount={scanCount}
            savedCount={library.length}
            onPayments={() => navigate("payments")}
            onOverlay={() => navigate("overlay")}
            onMissions={() => navigate("missions")}
            onLogout={handleLogout}
          />
        )}
      </View>

      {isTabScreen(view) && <BottomTabBar active={view} onChange={switchTab} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screenArea: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
});
