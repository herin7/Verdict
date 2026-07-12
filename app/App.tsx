import { useState } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { ScanScreen } from "./src/screens/ScanScreen";
import { ReportScreen } from "./src/screens/ReportScreen";
import type { ConsensusReport, ProductIdentity } from "./src/types";

export default function App() {
  const [result, setResult] = useState<{ report: ConsensusReport; product: ProductIdentity } | null>(null);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      {result ? (
        <ReportScreen
          report={result.report}
          product={result.product}
          onBack={() => setResult(null)}
        />
      ) : (
        <ScanScreen onReport={(report, product) => setResult({ report, product })} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0f19" },
});
