import { useEffect, useRef } from "react";
import { Animated, Easing, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GlassCard } from "../components/GlassCard";
import { Tappable } from "../components/Tappable";
import { FadeIn } from "../components/FadeIn";
import { AnimatedCounter } from "../components/AnimatedCounter";
import { CategoryIcon } from "../components/Icons";
import { Badge } from "../components/Badge";
import { colors, fonts, goldGradient, radius, verdictColor, verdictLabel } from "../theme";
import type { SavedReport } from "../types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

/** Slow, ambient drifting glow - purely decorative, never intercepts touches. */
function Orb({ style, delay = 0 }: { style: StyleProp<ViewStyle>; delay?: number }) {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 5200, delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [drift, delay]);

  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 18] });
  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });

  return (
    <Animated.View pointerEvents="none" style={[styles.orb, style, { transform: [{ translateX }, { translateY }] }]} />
  );
}

export function DashboardScreen({
  username,
  scanCount,
  savedCount,
  recent,
  onScan,
  onLibrary,
  onPayments,
  onOverlay,
  onOpenReport,
  onLogout,
}: {
  username: string;
  scanCount: number;
  savedCount: number;
  recent: SavedReport[];
  onScan: () => void;
  onLibrary: () => void;
  onPayments?: () => void;
  onOverlay?: () => void;
  onOpenReport: (entry: SavedReport) => void;
  onLogout: () => void;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });
  const recentItems = recent.slice(0, 6);

  return (
    <View style={styles.screen}>
      <Orb style={styles.orbTopRight} />
      <Orb style={styles.orbBottomLeft} delay={900} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <FadeIn duration={360}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>{greeting().toUpperCase()}</Text>
              <Text style={styles.greeting} numberOfLines={1}>
                {username}
              </Text>
            </View>
            <Tappable onPress={onLogout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={18} color={colors.textMuted} />
            </Tappable>
          </View>
        </FadeIn>

        <FadeIn duration={360} delay={70}>
          <View style={styles.statsRow}>
            <Tappable onPress={onScan} style={styles.statTap}>
              <GlassCard style={styles.statCard}>
                <Ionicons name="scan-outline" size={16} color={colors.accent} style={{ marginBottom: 6 }} />
                <AnimatedCounter value={scanCount} style={styles.statValue} />
                <Text style={styles.statLabel}>Scans</Text>
                <View style={styles.statAccent} />
              </GlassCard>
            </Tappable>
            <Tappable onPress={onLibrary} style={styles.statTap}>
              <GlassCard style={styles.statCard}>
                <Ionicons name="bookmark-outline" size={16} color={colors.accent} style={{ marginBottom: 6 }} />
                <AnimatedCounter value={savedCount} style={styles.statValue} />
                <Text style={styles.statLabel}>Saved</Text>
                <View style={styles.statAccent} />
              </GlassCard>
            </Tappable>
          </View>
        </FadeIn>

        <FadeIn duration={360} delay={140}>
          <Tappable onPress={onScan} style={styles.actionWrap}>
            <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionCard}>
              <View style={styles.actionIconWrap}>
                <Animated.View
                  style={[styles.actionGlow, { transform: [{ scale: glowScale }], opacity: glowOpacity }]}
                />
                <Ionicons name="scan-outline" size={22} color={colors.onAccent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Scan a product</Text>
                <Text style={styles.actionSub}>Point your camera, get the verdict</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onAccent} />
            </LinearGradient>
          </Tappable>
        </FadeIn>

        <FadeIn duration={360} delay={200}>
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
        </FadeIn>

        {onPayments && (
          <FadeIn duration={360} delay={230}>
            <Tappable onPress={onPayments}>
              <GlassCard style={styles.actionCardGlass}>
                <View style={styles.actionIconWrapGlass}>
                  <Ionicons name="card-outline" size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitleGlass}>Payment & Rewards</Text>
                  <Text style={styles.actionSubGlass}>Cards, wallets, memberships you own</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </GlassCard>
            </Tappable>
          </FadeIn>
        )}

        {onOverlay && (
          <FadeIn duration={360} delay={245}>
            <Tappable onPress={onOverlay}>
              <GlassCard style={styles.actionCardGlass}>
                <View style={styles.actionIconWrapGlass}>
                  <Ionicons name="layers-outline" size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitleGlass}>Shopping overlay</Text>
                  <Text style={styles.actionSubGlass}>Float over other apps (dev build)</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </GlassCard>
            </Tappable>
          </FadeIn>
        )}

        <FadeIn duration={360} delay={260}>
          <View style={styles.recentSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="time-outline" size={14} color={colors.textFaint} />
              <Text style={styles.sectionTitle}>Recently researched</Text>
            </View>

            {recentItems.length === 0 ? (
              <View style={styles.emptyRecent}>
                <Text style={styles.emptyRecentText}>Your first scan will show up here.</Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentRow}
              >
                {recentItems.map((item) => {
                  const color = verdictColor[item.report.verdict];
                  return (
                    <Tappable key={item.id} onPress={() => onOpenReport(item)}>
                      <GlassCard style={styles.recentCard}>
                        <CategoryIcon category={item.product.category} size={18} />
                        <Text style={styles.recentName} numberOfLines={2}>
                          {item.product.name}
                        </Text>
                        <Badge label={verdictLabel[item.report.verdict]} color={color} />
                      </GlassCard>
                    </Tappable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </FadeIn>

        <FadeIn duration={360} delay={320}>
          <View style={styles.footer}>
            <Ionicons name="flash" size={11} color={colors.textFaint} />
            <Text style={styles.footerText}>Verdict - powered by Anakin</Text>
          </View>
        </FadeIn>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingTop: 64, paddingHorizontal: 20, paddingBottom: 36 },

  orb: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(255,215,109,0.10)",
  },
  orbTopRight: { top: -60, right: -60 },
  orbBottomLeft: { bottom: 40, left: -80, backgroundColor: "rgba(255,215,109,0.06)" },

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
  statTap: { flex: 1 },
  statCard: { flex: 1, alignItems: "center", paddingVertical: 18, position: "relative", overflow: "hidden" },
  statValue: { fontFamily: fonts.monoBold, color: colors.accent, fontSize: 24 },
  statLabel: { fontFamily: fonts.sansSemiBold, color: colors.textMuted, fontSize: 12, marginTop: 4 },
  statAccent: {
    position: "absolute",
    bottom: 0,
    left: "30%",
    right: "30%",
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,215,109,0.4)",
  },

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
  actionGlow: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(23,17,6,0.3)",
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

  recentSection: { marginTop: 22 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  sectionTitle: { fontFamily: fonts.sansBold, color: colors.textFaint, fontSize: 11.5, letterSpacing: 0.6 },
  recentRow: { gap: 10, paddingRight: 8 },
  recentCard: { width: 128, gap: 8, alignItems: "flex-start" },
  recentName: { fontFamily: fonts.sansBold, color: colors.text, fontSize: 13, lineHeight: 17 },
  emptyRecent: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderStyle: "dashed",
    paddingVertical: 22,
    alignItems: "center",
  },
  emptyRecentText: { fontFamily: fonts.sansSemiBold, color: colors.textFaint, fontSize: 12.5 },

  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 28 },
  footerText: { fontFamily: fonts.sansSemiBold, color: colors.textFaint, fontSize: 11.5 },
});
