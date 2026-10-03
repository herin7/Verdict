import { useEffect, useRef, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { ZoomIn, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Icon } from "../../components/icons";
import { Press, Text } from "../../components/ui";
import { colors, fonts, motion, radius, shadow, space } from "../../theme";

type Option = { key: string; label: string };

/**
 * Big tappable answers. Short lists stack; long lists (more than four) go two
 * per row so all eight fit on one screen without scrolling.
 * `badge` is what sits in the corner of a selected card: a check, or its rank.
 */
export function OptionList({
  options,
  isSelected,
  badge,
  onPick,
}: {
  options: readonly Option[];
  isSelected: (key: string) => boolean;
  badge?: (key: string) => string | null;
  onPick: (key: string) => void;
}) {
  const grid = options.length > 4;
  return (
    <View style={[styles.list, grid && styles.grid]}>
      {options.map((o) => {
        const selected = isSelected(o.key);
        const mark = selected ? (badge?.(o.key) ?? null) : null;
        return (
          <Press
            key={o.key}
            onPress={() => onPick(o.key)}
            accessibilityRole={badge ? "checkbox" : "radio"}
            accessibilityState={{ checked: selected }}
            accessibilityLabel={mark && mark !== "✓" ? `${o.label}, ranked ${mark}` : o.label}
            style={[styles.option, grid && styles.optionGrid, selected && styles.optionOn]}
          >
            <Text variant="bodyStrong" style={[styles.optionLabel, selected && styles.optionLabelOn]} numberOfLines={2}>
              {o.label}
            </Text>
            {selected ? (
              <Animated.View entering={ZoomIn.springify().damping(14).stiffness(320)} style={styles.badge}>
                {mark && mark !== "✓" ? (
                  <Text variant="caption" style={styles.badgeText}>
                    {mark}
                  </Text>
                ) : (
                  <Icon.Check size={12} color={colors.onPrimary} weight="bold" />
                )}
              </Animated.View>
            ) : (
              <View style={styles.badgeEmpty} />
            )}
          </Press>
        );
      })}
    </View>
  );
}

/**
 * A stepped slider: drag or tap anywhere on the track, it snaps to the
 * nearest stop with a spring and a tick of haptics. Built on the responder
 * system so it needs no gesture library.
 */
export function StepSlider({
  options,
  value,
  onChange,
  ends,
}: {
  options: readonly Option[];
  value: string;
  onChange: (key: string) => void;
  /** Labels under the two ends of the track; defaults to the first and last option. */
  ends?: readonly [string, string];
}) {
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const last = options.length - 1;
  const track = useRef<View>(null);
  const trackX = useRef(0);
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withSpring((index / last) * width, motion.spring);
  }, [index, last, width, x]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const fill = useAnimatedStyle(() => ({ width: x.value }));

  function pick(pageX: number) {
    if (!width) return;
    const next = Math.round(Math.min(Math.max((pageX - trackX.current) / width, 0), 1) * last);
    if (next !== index) {
      void Haptics.selectionAsync();
      onChange(options[next].key);
    }
  }

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
    track.current?.measureInWindow((left) => (trackX.current = left));
  }

  return (
    <View
      style={styles.slider}
      accessible
      accessibilityRole="adjustable"
      accessibilityValue={{ text: options[index].label }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        const next = e.nativeEvent.actionName === "increment" ? Math.min(index + 1, last) : Math.max(index - 1, 0);
        onChange(options[next].key);
      }}
    >
      <Text style={styles.sliderValue} accessibilityElementsHidden>
        {options[index].label}
      </Text>

      <View
        style={styles.hitArea}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          // Re-measure: the screen may have slid in since layout.
          track.current?.measureInWindow((left) => {
            trackX.current = left;
            pick(e.nativeEvent.pageX);
          });
        }}
        onResponderMove={(e) => pick(e.nativeEvent.pageX)}
      >
        <View ref={track} style={styles.track} onLayout={onLayout}>
          <Animated.View style={[styles.trackFill, fill]} />
          {options.map((o, i) => (
            <View key={o.key} style={[styles.stop, { left: (i / last) * width - 3 }, i <= index && styles.stopOn]} />
          ))}
          <Animated.View style={[styles.thumb, thumb]} />
        </View>
      </View>

      <View style={styles.ends}>
        <Text variant="subhead">{ends?.[0] ?? options[0].label}</Text>
        <Text variant="subhead">{ends?.[1] ?? options[last].label}</Text>
      </View>
    </View>
  );
}

const THUMB = 32;

const styles = StyleSheet.create({
  list: { gap: space(3) },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    minHeight: 64,
    paddingHorizontal: space(5),
    paddingVertical: space(4),
    borderRadius: radius.lg,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    boxShadow: shadow.card,
  },
  // Two per row that always fill it: a fixed % plus the gap overflowed narrow
  // phones, so every card wrapped onto its own half-empty row.
  optionGrid: { flexGrow: 1, flexBasis: "40%", minHeight: 72, paddingHorizontal: space(4), alignItems: "flex-start" },
  optionOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  optionLabel: { flex: 1, fontSize: 17 },
  optionLabelOn: { color: colors.primary },
  badge: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  badgeText: { color: colors.onPrimary, fontFamily: fonts.extrabold },
  badgeEmpty: { width: 24, height: 24, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border },

  slider: { gap: space(8), paddingTop: space(4) },
  sliderValue: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, color: colors.primary },
  hitArea: { paddingVertical: space(4), marginHorizontal: -THUMB / 2, paddingHorizontal: THUMB / 2 },
  track: { height: 6, borderRadius: radius.full, backgroundColor: colors.border, justifyContent: "center" },
  trackFill: { position: "absolute", left: 0, height: 6, borderRadius: radius.full, backgroundColor: colors.primary },
  stop: { position: "absolute", width: 6, height: 6, borderRadius: radius.full, backgroundColor: colors.textFaint, opacity: 0.5 },
  stopOn: { backgroundColor: colors.onPrimary, opacity: 0.9 },
  thumb: {
    position: "absolute",
    left: -THUMB / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadow.raised,
  },
  ends: { flexDirection: "row", justifyContent: "space-between" },
});
