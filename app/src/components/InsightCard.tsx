import { useState, type ReactNode } from "react";
import { LayoutAnimation, Platform, StyleSheet, Text, UIManager, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassCard } from "./GlassCard";
import { Tappable } from "./Tappable";
import { SkeletonRows } from "./Shimmer";
import { colors, fonts } from "../theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type CardState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; data: T };

/** Collapsible card that lazily fetches its data on first expand, with its own skeleton loader and retry. */
export function InsightCard<T>({
  icon,
  title,
  teaser,
  fetcher,
  renderContent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  teaser: string;
  fetcher: () => Promise<T>;
  renderContent: (data: T) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<CardState<T>>({ status: "idle" });

  function load() {
    setState({ status: "loading" });
    fetcher()
      .then((data) => setState({ status: "loaded", data }))
      .catch(() => setState({ status: "error" }));
  }

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !expanded;
    setExpanded(next);
    if (next && state.status === "idle") load();
  }

  return (
    <GlassCard style={styles.card} padded={false}>
      <Tappable onPress={toggle} style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={16} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {!expanded && (
            <Text style={styles.teaser} numberOfLines={1}>
              {teaser}
            </Text>
          )}
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} />
      </Tappable>

      {expanded && (
        <View style={styles.body}>
          {state.status === "loading" && <SkeletonRows />}
          {state.status === "error" && (
            <Tappable onPress={load} style={styles.errorRow}>
              <Ionicons name="refresh-outline" size={14} color={colors.avoid} />
              <Text style={styles.errorText}>Couldn't load this - tap to retry</Text>
            </Tappable>
          )}
          {state.status === "loaded" && renderContent(state.data)}
        </View>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
  },
  title: { fontFamily: fonts.sansBold, color: colors.text, fontSize: 14.5 },
  teaser: { fontFamily: fonts.sans, color: colors.textMuted, fontSize: 12, marginTop: 2 },
  body: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 2, gap: 10 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  errorText: { fontFamily: fonts.sansSemiBold, color: colors.avoid, fontSize: 12.5 },
});
