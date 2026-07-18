import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "../components/Tappable";
import { FadeIn } from "../components/FadeIn";
import { AnimatedCounter } from "../components/AnimatedCounter";
import { CategoryIcon } from "../components/Icons";
import { Badge } from "../components/Badge";
import { ListRow } from "../components/ListRow";
import { EmptyState, IconButton, Screen, SectionHeader, Stagger, Surface } from "../components/ui";
import { fetchMissions, type MissionDto } from "../api/client";
import { statusColor } from "./MissionsScreen";
import { useLayout } from "../layout";
import {
  colors,
  ctaGradient,
  elevation,
  font,
  fonts,
  iconSize,
  radius,
  space,
  verdictColor,
  verdictLabel,
} from "../theme";
import type { SavedReport } from "../types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

export function DashboardScreen({
  username,
  scanCount,
  savedCount,
  recent,
  onScan,
  onSearch,
  onLibrary,
  onPayments,
  onOverlay,
  onMissions,
  onOpenReport,
  onLogout,
}: {
  username: string;
  scanCount: number;
  savedCount: number;
  recent: SavedReport[];
  onScan: () => void;
  onSearch?: () => void;
  onLibrary: () => void;
  onPayments?: () => void;
  onOverlay?: () => void;
  onMissions?: () => void;
  onOpenReport: (entry: SavedReport) => void;
  onLogout: () => void;
}) {
  const { gutter } = useLayout();
  const recentItems = recent.slice(0, 6);
  const [activeWatches, setActiveWatches] = useState<MissionDto[]>([]);

  useEffect(() => {
    if (!onMissions) return;
    let alive = true;
    fetchMissions()
      .then((res) => {
        if (!alive) return;
        setActiveWatches(res.items.filter((m) => m.status === "monitoring" || m.status === "awaiting_approval"));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [onMissions]);

  return (
    <Screen style={styles.screen} padded={false} edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: gutter }]}
      >
        <FadeIn duration={320}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>{greeting().toUpperCase()}</Text>
              <Text style={styles.greeting} numberOfLines={1}>
                {username}
              </Text>
            </View>
            <IconButton
              icon="log-out-outline"
              color={colors.textMuted}
              onPress={onLogout}
              accessibilityLabel="Sign out"
            />
          </View>
        </FadeIn>

        <FadeIn duration={320} delay={40}>
          <View style={styles.statsRow}>
            <Tappable onPress={onScan} style={styles.statTap} accessibilityLabel="Scans">
              <Surface style={styles.statCard}>
                <Ionicons name="scan-outline" size={iconSize.sm} color={colors.accent} />
                <AnimatedCounter value={scanCount} style={styles.statValue} />
                <Text style={styles.statLabel}>Scans</Text>
              </Surface>
            </Tappable>
            <Tappable onPress={onLibrary} style={styles.statTap} accessibilityLabel="Saved reports">
              <Surface style={styles.statCard}>
                <Ionicons name="bookmark-outline" size={iconSize.sm} color={colors.accent} />
                <AnimatedCounter value={savedCount} style={styles.statValue} />
                <Text style={styles.statLabel}>Saved</Text>
              </Surface>
            </Tappable>
          </View>
        </FadeIn>

        <FadeIn duration={320} delay={80}>
          <Tappable onPress={onScan} style={[styles.actionWrap, elevation.soft]} accessibilityLabel="Scan a product">
            <LinearGradient colors={ctaGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionCard}>
              <View style={styles.actionIconWrap}>
                <Ionicons name="scan-outline" size={iconSize.lg} color={colors.onAccent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Scan a product</Text>
                <Text style={styles.actionSub}>Camera or shopping link — get a clear verdict</Text>
              </View>
              <Ionicons name="chevron-forward" size={iconSize.md} color={colors.onAccent} />
            </LinearGradient>
          </Tappable>
        </FadeIn>

        {activeWatches.length > 0 ? (
          <FadeIn duration={320} delay={100}>
            <View style={styles.section}>
              <SectionHeader title="Watching for a price drop" icon="notifications-outline" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
                {activeWatches.map((m, i) => (
                  <Stagger key={m.id} index={i}>
                    <Tappable onPress={onMissions} accessibilityLabel={m.product?.name ?? m.title}>
                      <Surface style={styles.chipCard}>
                        <Ionicons name="notifications-outline" size={iconSize.sm} color={colors.accent} />
                        <Text style={styles.chipName} numberOfLines={2}>
                          {m.product?.name ?? m.title}
                        </Text>
                        <Badge
                          label={m.status === "monitoring" ? "Watching" : "Needs your OK"}
                          color={statusColor(m.status)}
                        />
                      </Surface>
                    </Tappable>
                  </Stagger>
                ))}
              </ScrollView>
            </View>
          </FadeIn>
        ) : null}

        <View style={styles.listGap}>
          {onSearch ? (
            <FadeIn duration={280} delay={120}>
              <ListRow
                icon="search-outline"
                title="Search & compare"
                subtitle="Type any product to compare prices"
                onPress={onSearch}
              />
            </FadeIn>
          ) : null}
          <FadeIn duration={280} delay={140}>
            <ListRow
              icon="bookmark-outline"
              title="Saved reports"
              subtitle="Revisit what you researched"
              onPress={onLibrary}
            />
          </FadeIn>
          {onMissions ? (
            <FadeIn duration={280} delay={160}>
              <ListRow
                icon="notifications-outline"
                title="Price Watch"
                subtitle="Set a price — we ping you when it drops"
                onPress={onMissions}
              />
            </FadeIn>
          ) : null}
          {onPayments ? (
            <FadeIn duration={280} delay={180}>
              <ListRow
                icon="card-outline"
                title="Payment & Rewards"
                subtitle="Cards, wallets, memberships you own"
                onPress={onPayments}
              />
            </FadeIn>
          ) : null}
          {onOverlay ? (
            <FadeIn duration={280} delay={200}>
              <ListRow
                icon="layers-outline"
                title="Shopping overlay"
                subtitle="Get the verdict inside shopping apps"
                onPress={onOverlay}
              />
            </FadeIn>
          ) : null}
        </View>

        <FadeIn duration={320} delay={220}>
          <View style={styles.section}>
            <SectionHeader title="Your recent verdicts" icon="time-outline" />
            {recentItems.length === 0 ? (
              <EmptyState
                icon="scan-outline"
                title="No scans yet"
                message="Your first verdict will show up here."
                actionLabel="Scan a product"
                onAction={onScan}
              />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
                {recentItems.map((item) => {
                  const color = verdictColor[item.report.verdict];
                  return (
                    <Tappable
                      key={item.id}
                      onPress={() => onOpenReport(item)}
                      accessibilityLabel={`${item.product.name}, ${verdictLabel[item.report.verdict]}`}
                    >
                      <Surface style={styles.chipCard}>
                        <CategoryIcon category={item.product.category} size={iconSize.md} />
                        <Text style={styles.chipName} numberOfLines={2}>
                          {item.product.name}
                        </Text>
                        <Badge label={verdictLabel[item.report.verdict]} color={color} />
                      </Surface>
                    </Tappable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </FadeIn>

        <View style={styles.footer}>
          <Ionicons name="flash" size={iconSize.sm} color={colors.textFaint} />
          <Text style={styles.footerText}>Verdict — know before you buy</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingTop: space(3), paddingBottom: space(10) },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: space(5), gap: space(3) },
  eyebrow: { ...font.label, color: colors.textFaint },
  greeting: { fontFamily: fonts.serif, fontSize: 28, lineHeight: 34, color: colors.text, marginTop: space(0.5) },
  statsRow: { flexDirection: "row", gap: space(3), marginBottom: space(4) },
  statTap: { flex: 1 },
  statCard: { alignItems: "center", paddingVertical: space(4), gap: space(1) },
  statValue: { fontFamily: fonts.monoBold, color: colors.accent, fontSize: 24, lineHeight: 30 },
  statLabel: { ...font.caption, fontFamily: fonts.sansSemiBold, color: colors.textMuted },
  actionWrap: { borderRadius: radius.lg, overflow: "hidden", marginBottom: space(4) },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3.5),
    padding: space(4),
    borderRadius: radius.lg,
  },
  actionIconWrap: {
    width: space(11),
    height: space(11),
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  actionTitle: { fontFamily: fonts.sansBold, color: colors.onAccent, fontSize: 16, lineHeight: 22 },
  actionSub: { ...font.caption, color: "rgba(255,255,255,0.85)", marginTop: space(0.5) },
  section: { marginTop: space(2), marginBottom: space(2) },
  listGap: { gap: space(2.5), marginBottom: space(3) },
  hRow: { gap: space(2.5), paddingRight: space(2) },
  chipCard: { width: space(32), gap: space(2), alignItems: "flex-start", padding: space(3.5) },
  chipName: { ...font.small, fontFamily: fonts.sansBold, color: colors.text, lineHeight: 17 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(1.5),
    marginTop: space(6),
  },
  footerText: { ...font.caption, fontFamily: fonts.sansSemiBold, color: colors.textFaint },
});
