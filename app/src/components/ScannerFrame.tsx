import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { colors, radius, space } from "../theme";

/** Idle-state viewfinder: breathing corner brackets + a slow scan-line sweep. */
export function ScannerFrame() {
  const [size, setSize] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    if (!size) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scan, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [size, scan]);

  const cornerOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const scanTranslate = scan.interpolate({ inputRange: [0, 1], outputRange: [6, Math.max(size - 6, 6)] });
  const scanOpacity = scan.interpolate({ inputRange: [0, 0.08, 0.92, 1], outputRange: [0, 1, 1, 0] });

  return (
    <View style={styles.finder} onLayout={(e) => setSize(e.nativeEvent.layout.height)}>
      <Animated.View style={[styles.corner, { top: -1, left: -1, opacity: cornerOpacity }]} />
      <Animated.View
        style={[styles.corner, { top: -1, right: -1, transform: [{ rotate: "90deg" }], opacity: cornerOpacity }]}
      />
      <Animated.View
        style={[styles.corner, { bottom: -1, right: -1, transform: [{ rotate: "180deg" }], opacity: cornerOpacity }]}
      />
      <Animated.View
        style={[styles.corner, { bottom: -1, left: -1, transform: [{ rotate: "270deg" }], opacity: cornerOpacity }]}
      />
      {size > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.scanLine, { opacity: scanOpacity, transform: [{ translateY: scanTranslate }] }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  finder: { width: "72%", aspectRatio: 1, position: "relative" },
  corner: {
    position: "absolute",
    width: space(7.5),
    height: space(7.5),
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderColor: colors.accent,
    borderTopLeftRadius: radius.md,
  },
  scanLine: {
    position: "absolute",
    left: space(1),
    right: space(1),
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
});
