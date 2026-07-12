import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "../components/Tappable";
import { colors, fonts, radius } from "../theme";
import {
  addBubbleTapListener,
  canDrawOverlays,
  hideBubble,
  isOverlaySupported,
  requestOverlayPermission,
  showBubble,
} from "verdict-overlay";
import {
  isAccessibilityServiceEnabled,
  isAccessibilitySupported,
  openAccessibilitySettings,
} from "verdict-accessibility";

export function OverlaySettingsScreen({
  onBack,
  onCaptureBase64,
}: {
  onBack: () => void;
  onCaptureBase64: (base64: string) => void;
}) {
  const [overlayOk, setOverlayOk] = useState(false);
  const [bubbleOn, setBubbleOn] = useState(false);
  const [a11yOn, setA11yOn] = useState(false);

  useEffect(() => {
    if (!isOverlaySupported) return;
    setOverlayOk(canDrawOverlays());
    setA11yOn(isAccessibilityServiceEnabled());

    // Screen-capture-on-tap (MediaProjection) was removed - it forced a "Start
    // recording or casting?" system dialog on every tap. Auto product-detection
    // via the accessibility text stream is coming in a follow-up pass.
    const tap = addBubbleTapListener(() => {});
    void onCaptureBase64;

    const poll = setInterval(() => {
      setOverlayOk(canDrawOverlays());
      setA11yOn(isAccessibilityServiceEnabled());
    }, 2000);

    return () => {
      tap.remove();
      clearInterval(poll);
    };
  }, [onCaptureBase64]);

  if (Platform.OS !== "android") {
    return (
      <View style={styles.screen}>
        <Header onBack={onBack} />
        <Text style={styles.body}>
          Floating overlay is Android-only. iOS Share Extension is deferred for a later cycle.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header onBack={onBack} />
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 40 }}>
        <Text style={styles.body}>
          Show a floating Verdict bubble over shopping apps. Tap it to capture the screen once and research the product.
        </Text>

        <Row
          title="Draw over other apps"
          subtitle={overlayOk ? "Permission granted" : "Required for the floating bubble"}
          actionLabel={overlayOk ? "Granted" : "Enable"}
          onPress={() => requestOverlayPermission()}
          disabled={overlayOk}
        />

        <Row
          title={bubbleOn ? "Hide floating bubble" : "Show floating bubble"}
          subtitle="Persistent notification while active (Android requirement)"
          actionLabel={bubbleOn ? "Hide" : "Show"}
          onPress={() => {
            if (!overlayOk) {
              requestOverlayPermission();
              return;
            }
            if (bubbleOn) {
              hideBubble();
              setBubbleOn(false);
            } else {
              showBubble();
              setBubbleOn(true);
            }
          }}
        />

        <View style={styles.divider} />

        <Text style={styles.disclosureTitle}>Enhanced accuracy (optional)</Text>
        <Text style={styles.disclosure}>
          Verdict can read on-screen text from shopping apps to detect products automatically. This is
          optional and off by default. It never taps, types, or controls other apps — text extraction only.
        </Text>

        {isAccessibilitySupported && (
          <Row
            title="Accessibility reading"
            subtitle={a11yOn ? "Enabled in system settings" : "Off — open system settings to enable"}
            actionLabel={a11yOn ? "Open settings" : "Enable"}
            onPress={() => openAccessibilitySettings()}
          />
        )}
      </ScrollView>
    </View>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Tappable onPress={onBack} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </Tappable>
      <Text style={styles.title}>Shopping overlay</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

function Row({
  title,
  subtitle,
  actionLabel,
  onPress,
  disabled,
}: {
  title: string;
  subtitle: string;
  actionLabel: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      <Tappable onPress={onPress} style={[styles.action, disabled && { opacity: 0.5 }]} disabled={disabled}>
        <Text style={styles.actionText}>{actionLabel}</Text>
      </Tappable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20, paddingTop: 8 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  title: { fontFamily: fonts.serif, fontSize: 22, color: colors.text },
  body: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  rowTitle: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.text },
  rowSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.textFaint, marginTop: 4 },
  action: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  actionText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.onAccent },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 8 },
  disclosureTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  disclosure: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
});
