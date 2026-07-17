import { useEffect, useRef, useState, type ReactNode } from "react";
import { LayoutAnimation, Platform, StyleSheet, Text, UIManager, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "./Tappable";
import { SkeletonRows } from "./Shimmer";
import { Surface } from "./ui";
import { colors, font, fonts, iconSize, radius, space } from "../theme";

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
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  function load() {
    setState({ status: "loading" });
    fetcher()
      .then((data) => mounted.current && setState({ status: "loaded", data }))
      .catch(() => mounted.current && setState({ status: "error" }));
  }

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !expanded;
    setExpanded(next);
    if (next && state.status === "idle") load();
  }

  return (
    <Surface style={styles.card} padded={false}>
      <Tappable onPress={toggle} style={styles.header} accessibilityLabel={title}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={iconSize.sm} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {!expanded && (
            <Text style={styles.teaser} numberOfLines={1}>
              {teaser}
            </Text>
          )}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={iconSize.sm}
          color={colors.textFaint}
        />
      </Tappable>

      {expanded && (
        <View style={styles.body}>
          {state.status === "loading" && <SkeletonRows />}
          {state.status === "error" && (
            <Tappable onPress={load} style={styles.errorRow} accessibilityLabel="Retry">
              <Ionicons name="refresh-outline" size={iconSize.sm} color={colors.avoid} />
              <Text style={styles.errorText}>Couldn't load this - tap to retry</Text>
            </Tappable>
          )}
          {state.status === "loaded" && renderContent(state.data)}
        </View>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { overflow: "hidden" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    padding: space(4),
  },
  iconWrap: {
    width: space(8.5),
    height: space(8.5),
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
  },
  title: { ...font.small, fontFamily: fonts.sansBold, color: colors.text },
  teaser: { ...font.caption, color: colors.textMuted, marginTop: space(0.5) },
  body: {
    paddingHorizontal: space(4),
    paddingBottom: space(4),
    paddingTop: space(0.5),
    gap: space(2.5),
  },
  errorRow: { flexDirection: "row", alignItems: "center", gap: space(1.5), paddingVertical: space(1) },
  errorText: { ...font.caption, fontFamily: fonts.sansSemiBold, color: colors.avoid },
});
