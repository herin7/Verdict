import { useEffect, useRef, useState } from "react";
import { Animated, Text, type StyleProp, type TextStyle } from "react-native";

/** Counts up from 0 to `value` whenever it changes - small delight on stat cards. */
export function AnimatedCounter({
  value,
  duration = 700,
  style,
}: {
  value: number;
  duration?: number;
  style?: StyleProp<TextStyle>;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    anim.setValue(0);
    const id = anim.addListener(({ value: v }) => setDisplay(Math.round(v * value)));
    Animated.timing(anim, { toValue: 1, duration, useNativeDriver: false }).start();
    return () => anim.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <Text style={style}>{display}</Text>;
}
