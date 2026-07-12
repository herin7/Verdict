import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

/** Pulsing gold-tinted skeleton bar, used while a deep-dive insight is loading. */
export function Shimmer({ style }: { style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.base, style, { opacity }]} />;
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  const widths: `${number}%`[] = ["72%", "94%", "58%", "83%"];
  return (
    <View style={{ gap: 9 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Shimmer key={i} style={{ height: 12, width: widths[i % widths.length] }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: "rgba(255,215,109,0.16)",
    borderRadius: 6,
  },
});
