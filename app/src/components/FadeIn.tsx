import type { StyleProp, ViewStyle } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { motion } from "../theme";

/**
 * Fades + slides content in on mount. Change `key` to replay.
 * Runs on the UI thread and is skipped when the OS "reduce motion" setting is on.
 */
export function FadeIn({
  children,
  duration = motion.normal,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  duration?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(duration)
        .delay(delay)
        .withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] })
        .reduceMotion(ReduceMotion.System)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
