import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Canvas, Circle, Path, Skia } from "@shopify/react-native-skia";
import { colors } from "../theme";

export function SkiaLoader({ size = 42 }: { size?: number }) {
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1, false);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const r = size / 2 - 4;
  const arc = Skia.Path.Make();
  arc.addArc({ x: 4, y: 4, width: size - 8, height: size - 8 }, -90, 100);

  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} color="rgba(255,215,109,0.12)" style="stroke" strokeWidth={3} />
        <Path path={arc} style="stroke" strokeWidth={3} strokeCap="round" color={colors.accent} />
      </Canvas>
    </Animated.View>
  );
}
