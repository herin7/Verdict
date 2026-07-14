import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, StyleSheet, View } from "react-native";
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
  addBubbleTapListener,
  canDrawOverlays,
  consumePanelIntent,
  hideBubble,
  isBubbleVisible,
  isOverlaySupported,
  moveTaskToBack,
  setBubbleHot,
  setPanelTranslucent,
  showBubble,
} from "verdict-overlay";
import {
  addLeftShoppingAppListener,
  addScreenTextListener,
  getCurrentScreenText,
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
import { ProductPanelScreen } from "./src/screens/ProductPanelScreen";
import { MissionsScreen } from "./src/screens/MissionsScreen";
import { DirectSearchScreen } from "./src/screens/DirectSearchScreen";
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
  | "productPanel";

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
  const [current, setCurrent] = useState<SavedReport | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [cameFrom, setCameFrom] = useState<Screen>("scan");
  const [library, setLibrary] = useState<SavedReport[]>([]);
  const [scanCount, setScanCountState] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [screenText, setScreenText] = useState<ScreenTextPayload | null>(null);
  const [panelPayload, setPanelPayload] = useState<ScreenTextPayload | null>(null);

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
      setView("scan");
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

  const checkPanelIntent = useCallback(() => {
    if (Platform.OS !== "android" || !isOverlaySupported) return;
    const panel = consumePanelIntent();
    if (!panel?.panel) return;
    if (panel.text?.trim()) {
      openProductPanel({
        text: panel.text,
        packageName: panel.packageName ?? "unknown",
      });
      return;
    }
    // Intent extras came in empty (a11y tree was still sparse the instant the
    // bubble was tapped, even after the native retries) - one more fresh
    // read now, since the tree usually finishes settling within a beat.
    if (!isAccessibilitySupported) return;
    const fresh = getCurrentScreenText();
    if (fresh.text?.trim()) {
      openProductPanel({ text: fresh.text, packageName: fresh.packageName ?? "unknown" });
    }
  }, []);

  // Cold-start / warm reorder (onNewIntent): consume panel intent extras.
  useEffect(() => {
    if (!username) return;
    checkPanelIntent();
  }, [username, checkPanelIntent]);

  // Safety net: bubble tap can bring the Activity forward via onNewIntent
  // slightly before/without the live bridge event landing. Re-check on
  // every foreground transition so the panel never gets missed.
  useEffect(() => {
    if (Platform.OS !== "android" || !username) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkPanelIntent();
    });
    return () => sub.remove();
  }, [username, checkPanelIntent]);

  useEffect(() => {
    if (view === "productPanel") {
      if (isOverlaySupported) setPanelTranslucent(true);
    } else if (isOverlaySupported) {
      setPanelTranslucent(false);
    }
  }, [view]);

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

    const tapSub = addBubbleTapListener((payload) => {
      const fresh = getCurrentScreenText();
      const text =
        (payload.text?.trim() ? payload.text : null) ||
        fresh.text?.trim() ||
        latestScreenText.current?.text ||
        null;
      const packageName =
        payload.packageName ||
        fresh.packageName ||
        latestScreenText.current?.packageName ||
        "unknown";
      if (text?.trim()) {
        const next = { text, packageName };
        latestScreenText.current = next;
        track("overlay_bubble_tapped");
        openProductPanel(next);
        return;
      }
      // Every source came back empty - the a11y tree was still settling
      // through all of the native retries too. One bounded extra try after
      // it's had a moment to finish laying out, then give up quietly.
      setTimeout(() => {
        const retry = getCurrentScreenText();
        if (!retry.text?.trim()) return;
        const next = { text: retry.text, packageName: retry.packageName || "unknown" };
        latestScreenText.current = next;
        track("overlay_bubble_tapped");
        openProductPanel(next);
      }, 180);
    });

    return () => {
      if (hotDebounce.current) clearTimeout(hotDebounce.current);
      textSub.remove();
      leftSub.remove();
      tapSub.remove();
    };
  }, [username]);

  function openProductPanel(payload: ScreenTextPayload) {
    setShareUrl(null);
    setScreenText(null);
    setPanelPayload(payload);
    setView("productPanel");
    track("overlay_panel_opened");
  }

  function closeProductPanel() {
    setPanelPayload(null);
    setView("dashboard");
    track("overlay_panel_closed");
    if (isOverlaySupported) {
      setPanelTranslucent(false);
      moveTaskToBack();
    }
  }

  async function refreshLibrary() {
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
      if (mapped.length) {
        setLibrary(mapped);
        return;
      }
    } catch {
      // fall through to local cache
    }
    setLibrary(await getSavedReports());
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
    setView("dashboard");
  }

  async function handleLogout() {
    track("auth_logout");
    if (supabaseConfigured && supabase) await supabase.auth.signOut();
    setUsername(null);
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
    setView(cameFrom === "overlay" || cameFrom === "productPanel" ? "dashboard" : cameFrom);
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
        <StatusBar style="light" />
        <OnboardingScreen onDone={finishOnboarding} />
      </View>
    );
  }

  if (!username) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <LoginScreen onLogin={handleLogin} />
      </View>
    );
  }

  const panelOpen = view === "productPanel" && panelPayload;

  return (
    <View style={[styles.root, panelOpen && styles.rootTransparent]}>
      <StatusBar style="light" />

      {view === "dashboard" && (
        <DashboardScreen
          username={username}
          scanCount={scanCount}
          savedCount={library.length}
          recent={library}
          onScan={() => {
            clearScanInputs();
            setView("scan");
          }}
          onSearch={() => setView("search")}
          onLibrary={() => {
            track("library_opened");
            setView("library");
          }}
          onPayments={() => setView("payments")}
          onOverlay={() => setView("overlay")}
          onMissions={() => setView("missions")}
          onOpenReport={(entry) => openSaved(entry, "dashboard")}
          onLogout={handleLogout}
        />
      )}

      {view === "search" && <DirectSearchScreen onHome={() => setView("dashboard")} />}

      {view === "payments" && <PaymentRewardsScreen onBack={() => setView("dashboard")} />}

      {view === "overlay" && <OverlaySettingsScreen onBack={() => setView("dashboard")} />}

      {view === "missions" && <MissionsScreen onBack={() => setView("dashboard")} />}

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
            setView("dashboard");
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
          onHome={() => setView("dashboard")}
        />
      )}

      {panelOpen && (
        <View style={StyleSheet.absoluteFill}>
          <ProductPanelScreen
            text={panelPayload.text}
            packageName={panelPayload.packageName}
            onClose={closeProductPanel}
            onOpenFullReport={(report, product, buyLinks, productId) => {
              setPanelPayload(null);
              setPanelTranslucent(false);
              setCameFrom("productPanel");
              openReport(report, product, buyLinks, productId);
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rootTransparent: { backgroundColor: "transparent" },
  center: { alignItems: "center", justifyContent: "center" },
});
