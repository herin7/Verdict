import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GlassCard } from "../components/GlassCard";
import { Tappable } from "../components/Tappable";
import { colors, fonts, goldGradient, radius } from "../theme";

export function DashboardScreen({
  username,
  scanCount,
  savedCount,
  onScan,
  onLibrary,
  onLogout,
}: {
  username: string;
  scanCount: number;
  savedCount: number;
  onScan: () => void;
  onLibrary: () => void;
  onLogout: () => void;
}) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>WELCOME BACK</Text>
          <Text style={styles.greeting} numberOfLines={1}>
            {username}
          </Text>
        </View>
        <Tappable onPress={onLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={18} color={colors.textMuted} />
        </Tappable>
      </View>

      <View style={styles.statsRow}>
        <GlassCard style={styles.statCard}>
          <Text style={styles.statValue}>{scanCount}</Text>
          <Text style={styles.statLabel}>Scans</Text>
        </GlassCard>
        <GlassCard style={styles.statCard}>
          <Text style={styles.statValue}>{savedCount}</Text>
          <Text style={styles.statLabel}>Saved</Text>
        </GlassCard>
      </View>

      <Tappable onPress={onScan} style={styles.actionWrap}>
        <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionCard}>
          <View style={styles.actionIconWrap}>
            <Ionicons name="scan-outline" size={22} color={colors.onAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Scan a product</Text>
            <Text style={styles.actionSub}>Point your camera, get the verdict</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.onAccent} />
        </LinearGradient>
      </Tappable>

      <Tappable onPress={onLibrary}>
        <GlassCard style={styles.actionCardGlass}>
          <View style={styles.actionIconWrapGlass}>
            <Ionicons name="bookmark-outline" size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitleGlass}>Saved reports</Text>
            <Text style={styles.actionSubGlass}>Revisit what you've researched</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </GlassCard>
      </Tappable>

      <View style={styles.footer}>
        <Ionicons name="flash" size={11} color={colors.textFaint} />
        <Text style={styles.footerText}>Verdict - powered by Anakin</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingTop: 64, paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: 24, gap: 12 },
  eyebrow: { fontFamily: fonts.sansBold, color: colors.textFaint, fontSize: 11.5, letterSpacing: 0.8 },
  greeting: { fontFamily: fonts.serif, color: colors.text, fontSize: 30, marginTop: 2 },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },

  statsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  statCard: { flex: 1, alignItems: "center", paddingVertical: 18 },
  statValue: { fontFamily: fonts.monoBold, color: colors.accent, fontSize: 24 },
  statLabel: { fontFamily: fonts.sansSemiBold, color: colors.textMuted, fontSize: 12, marginTop: 4 },

  actionWrap: { borderRadius: radius.lg, overflow: "hidden", marginBottom: 12 },
  actionCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: radius.lg },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(23,17,6,0.14)",
  },
  actionTitle: { fontFamily: fonts.sansBold, color: colors.onAccent, fontSize: 16 },
  actionSub: { fontFamily: fonts.sansSemiBold, color: "rgba(23,17,6,0.65)", fontSize: 12, marginTop: 2 },

  actionCardGlass: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18 },
  actionIconWrapGlass: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
  },
  actionTitleGlass: { fontFamily: fonts.sansBold, color: colors.text, fontSize: 16 },
  actionSubGlass: { fontFamily: fonts.sansSemiBold, color: colors.textMuted, fontSize: 12, marginTop: 2 },

  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: "auto", paddingBottom: 24 },
  footerText: { fontFamily: fonts.sansSemiBold, color: colors.textFaint, fontSize: 11.5 },
});
