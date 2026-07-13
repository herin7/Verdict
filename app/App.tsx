import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, SafeAreaView, StyleSheet, View } from "react-native";
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
import { LoginScreen } from "./src/screens/LoginScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { ReportScreen } from "./src/screens/ReportScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { PaymentRewardsScreen } from "./src/screens/PaymentRewardsScreen";
import { OverlaySettingsScreen } from "./src/screens/OverlaySettingsScreen";
import { ProductPanelScreen } from "./src/screens/ProductPanelScreen";
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
import type { BuyLink, ConsensusReport, ProductIdentity, SavedReport } from "./src/types";

type Screen =
  | "dashboard"
  | "scan"
  | "library"
  | "report"
  | "payments"
  | "overlay"
  | "productPanel";

type ScreenTextPayload = { text: string; packageName: string };

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  return (
    <ShareIntentProvider>
      <AppInner />
    </ShareIntentProvider>
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
        setUsername(data.session?.user?.email ?? data.session?.user?.id ?? null);
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
          setUsername(session?.user?.email ?? session?.user?.id ?? null);
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
    if (panel?.panel && panel.text?.trim()) {
      openProductPanel({
        text: panel.text,
        packageName: panel.packageName ?? "unknown",
      });
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
      if (!isBubbleVisible()) showBubble();
      setBubbleHot(
        typeof isProductPage === "boolean" ? isProductPage : detectProductPage(text, packageName)
      );
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
      if (!text?.trim()) return;
      const next = { text, packageName };
      latestScreenText.current = next;
      openProductPanel(next);
    });

    return () => {
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
  }

  function closeProductPanel() {
    setPanelPayload(null);
    setView("dashboard");
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
    setUsername(name);
    setView("dashboard");
  }

  async function handleLogout() {
    if (supabaseConfigured && supabase) await supabase.auth.signOut();
    setUsername(null);
    if (isOverlaySupported && isBubbleVisible()) hideBubble();
  }

  async function finishOnboarding() {
    await setOnboardingDone();
    setOnboardingDoneState(true);
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
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <OnboardingScreen onDone={finishOnboarding} />
      </SafeAreaView>
    );
  }

  if (!username) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <LoginScreen onLogin={handleLogin} />
      </SafeAreaView>
    );
  }

  const panelOpen = view === "productPanel" && panelPayload;

  return (
    <SafeAreaView style={[styles.root, panelOpen && styles.rootTransparent]}>
      <StatusBar style="light" translucent={Boolean(panelOpen)} />

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
          onLibrary={() => setView("library")}
          onPayments={() => setView("payments")}
          onOverlay={() => setView("overlay")}
          onOpenReport={(entry) => openSaved(entry, "dashboard")}
          onLogout={handleLogout}
        />
      )}

      {view === "payments" && <PaymentRewardsScreen onBack={() => setView("dashboard")} />}

      {view === "overlay" && <OverlaySettingsScreen onBack={() => setView("dashboard")} />}

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
          onOpen={openSaved}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rootTransparent: { backgroundColor: "transparent" },
  center: { alignItems: "center", justifyContent: "center" },
});
