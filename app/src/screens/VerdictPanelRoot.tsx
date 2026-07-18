import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { addPanelReopenListener, closePanel, openMainApp } from "verdict-overlay";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ProductPanelScreen } from "./ProductPanelScreen";
import { requestOpenFullReport } from "../panelBridge";
import { track } from "../analytics/posthog";
import { colors } from "../theme";
import type { BuyLink, ConsensusReport, ProductIdentity } from "../types";

/**
 * Root component for the "VerdictPanel" surface - a SEPARATE ReactSurface
 * from the main app's "main" surface, hosted directly in a WindowManager
 * overlay window by VerdictOverlayService (see showPanel/hidePanel there),
 * sized to the sheet's own footprint. This lets the panel float over
 * whatever shopping app is currently foreground WITHOUT ever launching
 * MainActivity - the app underneath keeps running and stays touchable
 * everywhere outside the sheet's bounds.
 *
 * Registered via AppRegistry in index.ts. Native passes {text, packageName}
 * as this component's initial props (the surface's initialProps Bundle) on
 * the FIRST-EVER open only - hidePanel keeps the surface alive afterward, so
 * every open after that reattaches the SAME already-mounted surface instead
 * of recreating it (see VerdictOverlayService.reattachExistingPanel), and
 * this component stays mounted across those reopens too. The onPanelReopen
 * listener + `session.seq`-keyed remount below is what makes each reopen
 * still behave like a fresh open (fresh capture, reset tab/state) despite
 * the surface itself never remounting.
 */
type Props = { text?: string; packageName?: string };

export function VerdictPanelRoot({ text, packageName }: Props) {
  const [session, setSession] = useState({ text: text ?? "", packageName: packageName ?? "", seq: 0 });

  useEffect(() => {
    const sub = addPanelReopenListener((nextText, nextPackageName) => {
      setSession((s) => ({ text: nextText, packageName: nextPackageName, seq: s.seq + 1 }));
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    track("overlay_panel_opened");
  }, [session.seq]);

  const handleClose = useCallback(() => {
    track("overlay_panel_closed");
    closePanel();
  }, []);

  const handleOpenFullReport = useCallback(
    (report: ConsensusReport, product: ProductIdentity, buyLinks: BuyLink[], productId: string | null) => {
      requestOpenFullReport({ report, product, buyLinks, productId });
      openMainApp();
      closePanel();
    },
    []
  );

  return (
    <View style={styles.root}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <ProductPanelScreen
            key={session.seq}
            text={session.text}
            packageName={session.packageName || "unknown"}
            onClose={handleClose}
            onOpenFullReport={handleOpenFullReport}
          />
        </SafeAreaProvider>
      </ErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
