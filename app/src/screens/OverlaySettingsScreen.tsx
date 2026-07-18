import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "../components/Tappable";
import { Divider, PillButton, Screen, ScreenHeader, SectionHeader, Surface } from "../components/ui";
import { colors, font, fonts, iconSize, radius, space } from "../theme";
import { WATCHED_SHOPPING_APPS } from "../overlayApps";
import { detectCountry, getCountry, setCountry, type Country } from "../country";
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
import { track } from "../analytics/posthog";

export function OverlaySettingsScreen({ onBack }: { onBack: () => void }) {
  const [overlayOk, setOverlayOk] = useState(false);
  const [a11yOn, setA11yOn] = useState(false);
  const [bubbleOn, setBubbleOn] = useState(false);
  const [country, setCountryState] = useState<Country>(detectCountry());

  useEffect(() => {
    getCountry().then(setCountryState).catch(() => {});
  }, []);

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

  const onSelectCountry = async (next: Country) => {
    setCountryState(next);
    await setCountry(next);
    track("country_changed", { country: next });
  };

  if (Platform.OS !== "android") {
    return (
      <Screen>
        <ScreenHeader title="Shopping overlay" onBack={onBack} />
        <Text style={styles.body}>
          Shopping overlay is Android-only. iOS Share Extension comes in a later cycle.
        </Text>
      </Screen>
    );
  }

  const ready = overlayOk && a11yOn;

  return (
    <Screen>
      <ScreenHeader title="Shopping overlay" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.body}>
          Open a shopping app and Verdict appears automatically. Tap the bubble to research what is
          on screen. No screen casting. No recording prompt.
        </Text>

        {ready ? (
          <View style={styles.readyPill}>
            <Ionicons name="checkmark-circle" size={iconSize.sm} color={colors.accent} />
            <Text style={styles.readyText}>Ready - auto-detect is on</Text>
          </View>
        ) : (
          <View style={styles.warnPill}>
            <Ionicons name="alert-circle-outline" size={iconSize.sm} color={colors.wait} />
            <Text style={styles.warnText}>Enable both permissions below</Text>
          </View>
        )}

        <SectionHeader title="1. Accessibility" />
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

        <SectionHeader title="2. Display over other apps" />
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

        <Divider />

        <SectionHeader title="Country" />
        <Text style={styles.disclosure}>
          Prices and marketplaces follow this. Auto from device locale; override anytime.
        </Text>
        <View style={styles.countryRow}>
          <PillButton
            label="India (₹)"
            active={country === "IN"}
            onPress={() => onSelectCountry("IN")}
          />
          <PillButton
            label="United States ($)"
            active={country === "US"}
            onPress={() => onSelectCountry("US")}
          />
        </View>
        <Text style={styles.rowSub}>Detected locale default: {detectCountry()}</Text>

        <Divider />

        <SectionHeader title="Watched apps" />
        <Text style={styles.disclosure}>
          Verdict only reads these. Everything else (messages, banking, gallery, personal apps) is
          blocked by construction.
        </Text>
        <View style={styles.appList}>
          {WATCHED_SHOPPING_APPS.map((app) => (
            <Surface key={app.id} style={styles.appRow} padded={false}>
              <Ionicons name="bag-handle-outline" size={iconSize.sm} color={colors.accent} />
              <Text style={styles.appLabel}>{app.label}</Text>
              <Text style={styles.appBadge}>Enabled</Text>
            </Surface>
          ))}
        </View>

        <Surface style={styles.blockedBox}>
          <Text style={styles.blockedTitle}>Blocked</Text>
          <Text style={styles.disclosure}>
            WhatsApp, Instagram, Gmail, banking apps, Photos, and any app not listed above. Screen
            text from those apps is never collected.
          </Text>
        </Surface>
      </ScrollView>
    </Screen>
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
    <Surface style={styles.row} padded={false}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      <Tappable onPress={onPress} style={[styles.action, disabled && styles.disabled]} disabled={disabled}>
        <Text style={styles.actionText}>{actionLabel}</Text>
      </Tappable>
    </Surface>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: space(3.5), paddingBottom: space(10) },
  body: { ...font.small, fontFamily: fonts.sans, color: colors.textMuted, lineHeight: 20 },
  disclosure: { ...font.small, fontFamily: fonts.sans, color: colors.textMuted },
  readyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    paddingVertical: space(2.5),
    paddingHorizontal: space(3),
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
  },
  readyText: { ...font.small, fontFamily: fonts.sansSemiBold, color: colors.accent },
  warnPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    paddingVertical: space(2.5),
    paddingHorizontal: space(3),
    borderRadius: radius.md,
    backgroundColor: colors.waitSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.wait,
  },
  warnText: { ...font.small, fontFamily: fonts.sansSemiBold, color: colors.wait },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    padding: space(3.5),
  },
  rowTitle: { ...font.bodyMedium, fontFamily: fonts.sansSemiBold, color: colors.text },
  rowSub: { ...font.caption, color: colors.textFaint, marginTop: space(1) },
  action: {
    backgroundColor: colors.accent,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: radius.pill,
  },
  actionText: { ...font.caption, fontFamily: fonts.sansBold, color: colors.onAccent },
  disabled: { opacity: 0.5 },
  countryRow: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  appList: { gap: space(2) },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2.5),
    paddingVertical: space(2.5),
    paddingHorizontal: space(3),
  },
  appLabel: { flex: 1, ...font.small, fontFamily: fonts.sansSemiBold, color: colors.text },
  appBadge: {
    ...font.label,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: space(2),
    paddingVertical: space(1),
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  blockedBox: { gap: space(1.5) },
  blockedTitle: { ...font.small, fontFamily: fonts.sansBold, color: colors.textMuted },
});
