import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ProductThumb, type ThumbStatus } from "./ProductThumb";
import { FadeIn } from "./FadeIn";
import { colors, font, fonts, iconSize, radius, space } from "../theme";
import type { ProductIdentity } from "../types";

const MESSAGES = [
  "Searching Reddit threads…",
  "Reading Flipkart & Amazon reviews…",
  "Checking long-term owner complaints…",
  "Cross-checking price history…",
  "Filtering fake reviews…",
  "Weighing pros against complaints…",
  "Writing your verdict…",
];

export function ResearchingScreen({
  product,
  thumbStatus,
  imageUrl,
  fallbackUri,
}: {
  product: ProductIdentity;
  thumbStatus: ThumbStatus;
  imageUrl?: string | null;
  fallbackUri?: string | null;
}) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const id = setInterval(() => setMsgIndex((i) => (i + 1) % MESSAGES.length), 1900);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    if (!trackWidth) return;
    const loop = Animated.loop(
      Animated.timing(bar, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [trackWidth, bar]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });
  const barWidth = Math.max(trackWidth * 0.36, space(10));
  const barTranslate = bar.interpolate({ inputRange: [0, 1], outputRange: [-barWidth, trackWidth] });

  return (
    <FadeIn style={styles.root} duration={260}>
      <View style={styles.center}>
        <View style={styles.thumbWrap}>
          <Animated.View style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
          <View style={styles.thumbInner}>
            <ProductThumb
              category={product.category}
              status={thumbStatus}
              imageUrl={imageUrl}
              fallbackUri={fallbackUri}
              size={space(19)}
            />
          </View>
        </View>

        <Text style={styles.eyebrow}>RESEARCHING</Text>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>

        <View style={styles.msgWrap}>
          <FadeIn key={msgIndex} duration={260} distance={6}>
            <View style={styles.msgRow}>
              <Ionicons name="sparkles-outline" size={iconSize.sm} color={colors.accent} />
              <Text style={styles.msg}>{MESSAGES[msgIndex]}</Text>
            </View>
          </FadeIn>
        </View>

        <View style={styles.track} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
          {trackWidth > 0 ? (
            <Animated.View style={[styles.bar, { width: barWidth, transform: [{ translateX: barTranslate }] }]} />
          ) : null}
        </View>
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  center: { alignItems: "center", paddingHorizontal: space(9), gap: space(1) },
  thumbWrap: { alignItems: "center", justifyContent: "center", marginBottom: space(5) },
  ring: {
    position: "absolute",
    width: space(24),
    height: space(24),
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  thumbInner: {
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  eyebrow: { ...font.label, color: colors.accent, letterSpacing: 1.5, marginBottom: space(2) },
  name: {
    fontFamily: fonts.serif,
    fontSize: 24,
    lineHeight: 30,
    color: colors.text,
    textAlign: "center",
    marginBottom: space(5),
  },
  msgWrap: { height: space(5.5), justifyContent: "center", marginBottom: space(6) },
  msgRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  msg: { ...font.small, color: colors.textMuted },
  track: {
    width: "62%",
    height: space(1),
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  bar: {
    position: "absolute",
    height: space(1),
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
});
