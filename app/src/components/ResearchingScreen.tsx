import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ProductThumb, type ThumbStatus } from "./ProductThumb";
import { FadeIn } from "./FadeIn";
import { colors, fonts, radius } from "../theme";
import type { ProductIdentity } from "../types";

const MESSAGES = [
  "Scanning Reddit threads...",
  "Reading Amazon & Flipkart reviews...",
  "Checking long-term owner complaints...",
  "Cross-referencing price history...",
  "Filtering out fake reviews...",
  "Weighing pros against complaints...",
  "Synthesizing the internet's verdict...",
];

/**
 * Full-screen takeover shown the instant "Research" is tapped - covers the live
 * camera entirely so the user visually leaves the scanner rather than waiting on it.
 */
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

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  const barWidth = Math.max(trackWidth * 0.36, 40);
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
              size={76}
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
              <Ionicons name="sparkles-outline" size={13} color={colors.accent} />
              <Text style={styles.msg}>{MESSAGES[msgIndex]}</Text>
            </View>
          </FadeIn>
        </View>

        <View style={styles.track} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
          {trackWidth > 0 && (
            <Animated.View style={[styles.bar, { width: barWidth, transform: [{ translateX: barTranslate }] }]} />
          )}
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
  center: { alignItems: "center", paddingHorizontal: 36, gap: 4 },

  thumbWrap: { alignItems: "center", justifyContent: "center", marginBottom: 22 },
  ring: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    borderColor: "rgba(255,215,109,0.7)",
  },
  thumbInner: {
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,215,109,0.25)",
  },

  eyebrow: {
    fontFamily: fonts.sansBold,
    color: colors.accent,
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 8,
  },
  name: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 24,
    textAlign: "center",
    lineHeight: 28,
    marginBottom: 22,
  },

  msgWrap: { height: 22, justifyContent: "center", marginBottom: 26 },
  msgRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  msg: { fontFamily: fonts.sansSemiBold, color: colors.textMuted, fontSize: 13.5 },

  track: {
    width: "62%",
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  bar: {
    position: "absolute",
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
    shadowColor: "#FFD76D",
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
});
