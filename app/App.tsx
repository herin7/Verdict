import { useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from "@expo-google-fonts/instrument-serif";
import { Arimo_400Regular, Arimo_500Medium, Arimo_600SemiBold, Arimo_700Bold } from "@expo-google-fonts/arimo";
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import { LoginScreen } from "./src/screens/LoginScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { ReportScreen } from "./src/screens/ReportScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { colors } from "./src/theme";
import {
  clearSession,
  deleteReport,
  getSavedReports,
  getScanCount,
  getSession,
  incrementScanCount,
  makeReportId,
  saveReport,
  setSession,
} from "./src/storage";
import type { BuyLink, ConsensusReport, ProductIdentity, SavedReport } from "./src/types";

type Screen = "dashboard" | "scan" | "library" | "report";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
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
  const [username, setUsername] = useState<string | null>(null);

  const [view, setView] = useState<Screen>("dashboard");
  const [current, setCurrent] = useState<SavedReport | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [cameFrom, setCameFrom] = useState<Screen>("scan");
  const [library, setLibrary] = useState<SavedReport[]>([]);
  const [scanCount, setScanCount] = useState(0);

  useEffect(() => {
    (async () => {
      const session = await getSession();
      setUsername(session?.username ?? null);
      setAuthChecked(true);
    })();
  }, []);

  useEffect(() => {
    if (fontsLoaded && authChecked) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, authChecked]);

  useEffect(() => {
    if (username) {
      refreshLibrary();
      getScanCount().then(setScanCount);
    }
  }, [username]);

  async function refreshLibrary() {
    setLibrary(await getSavedReports());
  }

  async function handleLogin(name: string) {
    await setSession(name);
    setUsername(name);
    setView("dashboard");
  }

  async function handleLogout() {
    await clearSession();
    setUsername(null);
  }

  async function openReport(report: ConsensusReport, product: ProductIdentity, buyLinks: BuyLink[]) {
    const entry: SavedReport = { id: makeReportId(), savedAt: Date.now(), product, report, buyLinks };
    setCurrent(entry);
    setIsSaved(false);
    setCameFrom("scan");
    setView("report");
    setScanCount(await incrementScanCount());
  }

  function openSaved(entry: SavedReport) {
    setCurrent(entry);
    setIsSaved(true);
    setCameFrom("library");
    setView("report");
  }

  async function handleToggleSave() {
    if (!current) return;
    if (isSaved) {
      await deleteReport(current.id);
      setIsSaved(false);
    } else {
      await saveReport(current);
      setIsSaved(true);
    }
    refreshLibrary();
  }

  async function handleDelete(id: string) {
    await deleteReport(id);
    refreshLibrary();
  }

  function backFromReport() {
    setView(cameFrom);
    setCurrent(null);
  }

  if (!fontsLoaded || !authChecked) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
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

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      {view === "dashboard" && (
        <DashboardScreen
          username={username}
          scanCount={scanCount}
          savedCount={library.length}
          onScan={() => setView("scan")}
          onLibrary={() => setView("library")}
          onLogout={handleLogout}
        />
      )}

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

      {view === "scan" && <ScanScreen onReport={openReport} onHome={() => setView("dashboard")} />}

      {view === "library" && (
        <LibraryScreen
          items={library}
          onOpen={openSaved}
          onDelete={handleDelete}
          onHome={() => setView("dashboard")}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
});
