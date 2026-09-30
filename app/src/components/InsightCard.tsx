import { useEffect, useRef, useState, type ReactNode } from "react";
import { LayoutAnimation, StyleSheet, View } from "react-native";
import { Icon, type IconComponent } from "./icons";
import { Press, Skeleton, Text } from "./ui";
import { colors, iconSize, radius, shadow, space } from "../theme";

type CardState<T> = { status: "idle" | "loading" | "error" } | { status: "loaded"; data: T };

/** Collapsed row that fetches its content on first expand, with its own skeleton and retry. */
export function InsightCard<T>({
  icon: Glyph,
  title,
  teaser,
  fetcher,
  renderContent,
}: {
  icon: IconComponent;
  title: string;
  teaser: string;
  fetcher: () => Promise<T>;
  renderContent: (data: T) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<CardState<T>>({ status: "idle" });
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  function load() {
    setState({ status: "loading" });
    fetcher()
      .then((data) => mounted.current && setState({ status: "loaded", data }))
      .catch(() => mounted.current && setState({ status: "error" }));
  }

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
    if (!expanded && state.status === "idle") load();
  }

  const Chevron = expanded ? Icon.CaretUp : Icon.CaretDown;
  return (
    <View style={styles.card}>
      <Press
        onPress={toggle}
        style={styles.header}
        accessibilityLabel={title}
        accessibilityHint={teaser}
        accessibilityState={{ expanded }}
      >
        <View style={styles.iconWrap}>
          <Glyph size={iconSize.md} color={colors.primary} weight="duotone" />
        </View>
        <View style={styles.text}>
          <Text variant="bodyStrong">{title}</Text>
          {!expanded ? (
            <Text variant="caption" numberOfLines={1}>
              {teaser}
            </Text>
          ) : null}
        </View>
        <Chevron size={iconSize.sm} color={colors.textFaint} weight="bold" />
      </Press>

      {expanded ? (
        <View style={styles.body}>
          {state.status === "loading" ? (
            <View style={styles.skeletons}>
              <Skeleton style={styles.line} />
              <Skeleton style={[styles.line, { width: "80%" }]} />
              <Skeleton style={[styles.line, { width: "60%" }]} />
            </View>
          ) : null}
          {state.status === "error" ? (
            <Press onPress={load} style={styles.retry} accessibilityLabel="Retry">
              <Icon.ArrowClockwise size={iconSize.sm} color={colors.avoid} weight="bold" />
              <Text variant="subhead" style={{ color: colors.avoid }}>
                Couldn't load this. Tap to retry.
              </Text>
            </Press>
          ) : null}
          {state.status === "loaded" ? renderContent(state.data) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderCurve: "continuous", boxShadow: shadow.card },
  header: { flexDirection: "row", alignItems: "center", gap: space(3), padding: space(4), minHeight: 64 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1, gap: space(0.5) },
  body: { paddingHorizontal: space(4), paddingBottom: space(4), gap: space(3) },
  skeletons: { gap: space(2) },
  line: { height: 12, width: "100%" },
  retry: { flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(2) },
});
