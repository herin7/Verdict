import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FadeIn } from "../components/FadeIn";
import { ListRow } from "../components/ListRow";
import { Tappable } from "../components/Tappable";
import { AnimatedCounter } from "../components/AnimatedCounter";
import { EmptyState, Field, Screen, SectionHeader, Surface } from "../components/ui";
import { useLayout } from "../layout";
import { getPaymentProfile, savePincode } from "../api/client";
import { colors, font, fonts, iconSize, radius, space } from "../theme";

type SettingsRow = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress?: () => void;
};

export function ProfileScreen({
  username,
  scanCount,
  savedCount,
  onPayments,
  onOverlay,
  onMissions,
  onLogout,
}: {
  username: string;
  scanCount: number;
  savedCount: number;
  onPayments?: () => void;
  onOverlay?: () => void;
  onMissions?: () => void;
  onLogout: () => void;
}) {
  const { gutter } = useLayout();
  const initial = username.trim().charAt(0).toUpperCase() || "?";

  const [pincode, setPincodeState] = useState("");
  const [pincodeStatus, setPincodeStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    getPaymentProfile()
      .then((p) => setPincodeState(p.pincode ?? ""))
      .catch(() => {});
  }, []);

  async function handleSavePincode(next: string) {
    if (!/^\d{6}$/.test(next)) return;
    setPincodeStatus("saving");
    try {
      await savePincode(next);
      setPincodeStatus("saved");
    } catch {
      setPincodeStatus("error");
    }
  }

  const rows: SettingsRow[] = [];
  if (onPayments) {
    rows.push({
      key: "payments",
      icon: "card-outline",
      title: "Payment & Rewards",
      subtitle: "Cards, wallets, memberships you own",
      onPress: onPayments,
    });
  }
  if (onOverlay) {
    rows.push({
      key: "overlay",
      icon: "layers-outline",
      title: "Shopping overlay",
      subtitle: "Get the verdict inside shopping apps",
      onPress: onOverlay,
    });
  }
  if (onMissions) {
    rows.push({
      key: "missions",
      icon: "notifications-outline",
      title: "Price Watch",
      subtitle: "Set a price - we ping you when it drops",
      onPress: onMissions,
    });
  }

  return (
    <Screen padded={false} edges={["top"]}>
      <FadeIn duration={360} style={[styles.scroll, { paddingHorizontal: gutter }]}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.eyebrow}>SIGNED IN AS</Text>
            <Text style={styles.username} numberOfLines={1}>
              {username}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <Surface style={styles.statCard}>
            <Ionicons name="scan-outline" size={iconSize.sm} color={colors.accent} />
            <AnimatedCounter value={scanCount} style={styles.statValue} />
            <Text style={styles.statLabel}>Scans</Text>
          </Surface>
          <Surface style={styles.statCard}>
            <Ionicons name="bookmark-outline" size={iconSize.sm} color={colors.accent} />
            <AnimatedCounter value={savedCount} style={styles.statValue} />
            <Text style={styles.statLabel}>Saved</Text>
          </Surface>
        </View>

        <View>
          <SectionHeader title="Delivery pincode" icon="location-outline" style={styles.sectionHeader} />
          <Surface style={styles.pincodeCard}>
            <Text style={styles.pincodeHint}>
              Used to show prices that match what you'd actually pay at your address.
            </Text>
            <View style={styles.pincodeRow}>
              <Field
                value={pincode}
                onChangeText={(t) => {
                  setPincodeState(t.replace(/\D/g, "").slice(0, 6));
                  setPincodeStatus("idle");
                }}
                onBlur={() => handleSavePincode(pincode)}
                placeholder="e.g. 400001"
                keyboardType="number-pad"
                maxLength={6}
                style={styles.pincodeField}
              />
              {pincodeStatus === "saving" && <Text style={styles.pincodeStatus}>Saving…</Text>}
              {pincodeStatus === "saved" && (
                <Ionicons name="checkmark-circle" size={iconSize.md} color={colors.buy} />
              )}
              {pincodeStatus === "error" && (
                <Text style={[styles.pincodeStatus, { color: colors.avoid }]}>Couldn't save</Text>
              )}
            </View>
          </Surface>
        </View>

        <SectionHeader title="Account & settings" icon="settings-outline" style={styles.sectionHeader} />

        {rows.length === 0 ? (
          <EmptyState icon="settings-outline" title="All set" message="Nothing to configure yet." />
        ) : (
          <View style={styles.listGap}>
            {rows.map((row) => (
              <ListRow
                key={row.key}
                icon={row.icon}
                title={row.title}
                subtitle={row.subtitle}
                onPress={row.onPress}
              />
            ))}
          </View>
        )}

        <Tappable onPress={onLogout} style={styles.logoutWrap} accessibilityLabel="Log out">
          <View style={styles.logoutRow}>
            <Ionicons name="log-out-outline" size={iconSize.md} color={colors.avoid} />
            <Text style={styles.logoutText}>Log out</Text>
          </View>
        </Tappable>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: space(3), paddingBottom: space(9), gap: space(4) },
  header: { flexDirection: "row", alignItems: "center", gap: space(3.5) },
  avatar: {
    width: space(14),
    height: space(14),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  avatarText: { fontFamily: fonts.serif, fontSize: 26, color: colors.accent },
  eyebrow: { ...font.label, color: colors.textFaint },
  username: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 30, color: colors.text, marginTop: space(0.5) },

  statsRow: { flexDirection: "row", gap: space(2.5) },
  statCard: { flex: 1, alignItems: "center", paddingVertical: space(4.5), gap: space(1) },
  statValue: { fontFamily: fonts.monoBold, fontSize: 24, lineHeight: 30, color: colors.accent },
  statLabel: { ...font.caption, fontFamily: fonts.sansSemiBold, color: colors.textMuted },

  sectionHeader: { marginBottom: 0 },

  pincodeCard: { gap: space(2.5) },
  pincodeHint: { ...font.caption, fontFamily: fonts.sansSemiBold, color: colors.textMuted },
  pincodeRow: { flexDirection: "row", alignItems: "center", gap: space(2.5) },
  pincodeField: { flex: 1 },
  pincodeStatus: { ...font.caption, fontFamily: fonts.sansSemiBold, color: colors.textMuted },

  listGap: { gap: space(2.5) },

  logoutWrap: { alignSelf: "center", marginTop: space(2) },
  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    paddingVertical: space(3),
    paddingHorizontal: space(5),
    borderRadius: radius.pill,
    backgroundColor: colors.avoidSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.avoid,
  },
  logoutText: { ...font.small, fontFamily: fonts.sansBold, color: colors.avoid },
});
