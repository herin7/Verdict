import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "../components/Tappable";
import { colors, fonts, radius } from "../theme";
import { WATCHED_SHOPPING_APPS } from "../overlayApps";
import {
  canDrawOverlays,
  hideBubble,
  isBubbleVisible,
  isOverlaySupported,
  requestOverlayPermission,
  showBubble,
} from "verdict-overlay";
import {
  isAccessibilityServiceEnabled,
  isAccessibilitySupported,
  openAccessibilitySettings,
} from "verdict-accessibility";

export function OverlaySettingsScreen({ onBack }: { onBack: () => void }) {
  const [overlayOk, setOverlayOk] = useState(false);
  const [a11yOn, setA11yOn] = useState(false);
  const [bubbleOn, setBubbleOn] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const refresh = () => {
      setOverlayOk(isOverlaySupported ? canDrawOverlays() : false);
      setA11yOn(isAccessibilitySupported ? isAccessibilityServiceEnabled() : false);
      setBubbleOn(isOverlaySupported ? isBubbleVisible() : false);
    };
    refresh();
    const poll = setInterval(refresh, 2000);
    return () => clearInterval(poll);
  }, []);

  if (Platform.OS !== "android") {
    return (
      <View style={styles.screen}>
        <Header onBack={onBack} />
        <Text style={styles.body}>
          Shopping overlay is Android-only. iOS Share Extension comes in a later cycle.
        </Text>
      </View>
    );
  }

  const ready = overlayOk && a11yOn;

  return (
    <View style={styles.screen}>
      <Header onBack={onBack} />
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 40 }}>
        <Text style={styles.body}>
          Open a shopping app and Verdict appears automatically. Tap the bubble to research what is
          on screen. No screen casting. No recording prompt.
        </Text>

        {ready ? (
          <View style={styles.readyPill}>
            <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
            <Text style={styles.readyText}>Ready - auto-detect is on</Text>
          </View>
        ) : (
          <View style={styles.warnPill}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.wait} />
            <Text style={styles.warnText}>Enable both permissions below</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>1. Accessibility</Text>
        <Text style={styles.disclosure}>
          Reads on-screen text from shopping apps only. Never taps, types, or controls other apps.
        </Text>
        {isAccessibilitySupported && (
          <Row
            title="Accessibility reading"
            subtitle={a11yOn ? "Enabled in system settings" : "Required for auto-detect"}
            actionLabel={a11yOn ? "Open settings" : "Enable"}
            onPress={() => openAccessibilitySettings()}
          />
        )}

        <Text style={styles.sectionTitle}>2. Display over other apps</Text>
        <Text style={styles.disclosure}>Lets Verdict show a floating bubble while you shop.</Text>
        {isOverlaySupported && (
          <Row
            title="Draw over other apps"
            subtitle={overlayOk ? "Permission granted" : "Required for the floating bubble"}
            actionLabel={overlayOk ? "Granted" : "Enable"}
            onPress={() => requestOverlayPermission()}
            disabled={overlayOk}
          />
        )}

        {isOverlaySupported && (
          <Row
            title={bubbleOn ? "Hide bubble now" : "Show bubble now"}
            subtitle="Usually auto-shows in shopping apps. Manual toggle for testing."
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
        )}

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Watched apps</Text>
        <Text style={styles.disclosure}>
          Verdict only reads these. Everything else (messages, banking, gallery, personal apps) is
          blocked by construction.
        </Text>
        <View style={styles.appList}>
          {WATCHED_SHOPPING_APPS.map((app) => (
            <View key={app.id} style={styles.appRow}>
              <Ionicons name="bag-handle-outline" size={16} color={colors.accent} />
              <Text style={styles.appLabel}>{app.label}</Text>
              <Text style={styles.appBadge}>Enabled</Text>
            </View>
          ))}
        </View>

        <View style={styles.blockedBox}>
          <Text style={styles.blockedTitle}>Blocked</Text>
          <Text style={styles.disclosure}>
            WhatsApp, Instagram, Gmail, banking apps, Photos, and any app not listed above. Screen
            text from those apps is never collected.
          </Text>
        </View>
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
  sectionTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text, marginTop: 4 },
  disclosure: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  readyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: "rgba(255,215,109,0.25)",
  },
  readyText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.accent },
  warnPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,180,80,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,180,80,0.25)",
  },
  warnText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.wait },
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
  appList: { gap: 8 },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  appLabel: { flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.text },
  appBadge: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  blockedBox: {
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: 6,
  },
  blockedTitle: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.textMuted },
});
