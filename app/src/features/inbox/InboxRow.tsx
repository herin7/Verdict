import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { ProductThumb } from "../../components/ProductThumb";
import { Press, Text } from "../../components/ui";
import { colors, fonts, radius, space, verdictColor, verdictLabel, verdictSoft } from "../../theme";
import { isWorking, itemTitle, type InboxItem } from "./types";

/** One shared thing: thumbnail, name, and where it's at. */
export function InboxRow({
  item,
  onPress,
  onLongPress,
}: {
  item: InboxItem;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const share = item.server;
  return (
    <Press onPress={onPress} onLongPress={onLongPress} style={styles.row} accessibilityHint="Long-press to delete">
      <ProductThumb
        category={share?.product?.category ?? ""}
        imageUrl={share?.imageUrl}
        fallbackUri={item.preview.localImageUri}
        size={56}
      />
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {itemTitle(item)}
        </Text>
        <Status item={item} />
      </View>
    </Press>
  );
}

function Status({ item }: { item: InboxItem }) {
  const share = item.server;
  if (item.pending) return <Text variant="subhead">Sending…</Text>;
  if (share?.status === "ready" && share.report) {
    const verdict = share.report.verdict;
    return (
      <View style={styles.ready}>
        <View style={[styles.pill, { backgroundColor: verdictSoft[verdict] }]}>
          <Text variant="caption" style={[styles.pillText, { color: verdictColor[verdict] }]}>
            {verdictLabel[verdict].toUpperCase()}
          </Text>
        </View>
        <Text variant="subhead" numberOfLines={1} style={styles.flex}>
          {share.report.verdictLine}
        </Text>
      </View>
    );
  }
  if (share?.status === "needs_input") return <Text variant="subhead" style={styles.attention}>Which product is this?</Text>;
  if (share?.status === "failed") return <Text variant="subhead" style={styles.failed}>Couldn't finish — tap to retry</Text>;
  if (isWorking(item)) {
    return (
      <View style={styles.ready}>
        <PulsingDot />
        <Text variant="subhead" numberOfLines={1} style={styles.flex}>
          {share?.stage ?? "Investigating…"}
        </Text>
      </View>
    );
  }
  return null;
}

/** Quiet "still working" signal; holds still when reduce-motion is on. */
function PulsingDot() {
  const opacity = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (!reduceMotion) opacity.value = withRepeat(withTiming(0.25, { duration: 800 }), -1, true);
  }, [opacity, reduceMotion]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, animated]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(3), paddingHorizontal: space(4) },
  text: { flex: 1, gap: space(1) },
  ready: { flexDirection: "row", alignItems: "center", gap: space(2) },
  pill: { paddingHorizontal: space(2), paddingVertical: 2, borderRadius: radius.full },
  pillText: { fontFamily: fonts.extrabold, letterSpacing: 0.6 },
  attention: { color: colors.wait },
  failed: { color: colors.avoid },
  dot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.primary },
});
