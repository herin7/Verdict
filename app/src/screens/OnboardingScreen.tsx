import { useRef, useState } from "react";
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { MotiView } from "moti";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tappable } from "../components/Tappable";
import { useLayout } from "../layout";
import { colors, ctaGradient, elevation, font, fonts, iconSize, motion, radius, space } from "../theme";

const SLIDES = [
  {
    key: "scan",
    icon: "scan-outline" as const,
    title: "Point. Identify.",
    body: "Snap any product on the shelf or online. Verdict names it in seconds.",
  },
  {
    key: "consensus",
    icon: "planet-outline" as const,
    title: "Real internet consensus.",
    body: "Not one review. Reddit, Flipkart, Amazon, forums and price history — distilled.",
  },
  {
    key: "decide",
    icon: "flash-outline" as const,
    title: "Buy with clarity.",
    body: "Clear Buy / Wait / Avoid, risks, alternatives, and the best price across stores.",
  },
];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const { width, gutter } = useLayout();

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  }).current;

  function next() {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
      return;
    }
    onDone();
  }

  return (
    <View style={styles.root}>
      <View style={[styles.heroWash, { paddingTop: insets.top + space(10) }]}>
        <Text style={styles.brand}>Verdict</Text>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 60 }}
        onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          setIndex(i);
        }}
        renderItem={({ item, index: i }) => (
          <View style={[styles.slide, { width, paddingHorizontal: gutter * 1.5 }]}>
            <MotiView
              from={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: i === index ? 1 : 0.45, scale: i === index ? 1 : 0.94 }}
              transition={{ type: "timing", duration: motion.normal }}
              style={styles.iconWrap}
            >
              <Ionicons name={item.icon} size={iconSize.xl} color={colors.accent} />
            </MotiView>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingHorizontal: gutter * 1.5, paddingBottom: space(6) + insets.bottom }]}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
        <Tappable onPress={next} style={[styles.btnWrap, elevation.soft]} accessibilityLabel={index === SLIDES.length - 1 ? "Get started" : "Next"}>
          <LinearGradient colors={ctaGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
            <Text style={styles.btnText}>{index === SLIDES.length - 1 ? "Get started" : "Next"}</Text>
            <Ionicons name="arrow-forward" size={iconSize.sm} color={colors.onAccent} />
          </LinearGradient>
        </Tappable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  heroWash: { alignItems: "center", paddingBottom: space(2) },
  brand: { ...font.h1, color: colors.text },
  slide: { paddingTop: space(8), alignItems: "center" },
  iconWrap: {
    width: space(18),
    height: space(18),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: space(5),
  },
  title: { ...font.h1, color: colors.text, textAlign: "center" },
  body: {
    ...font.body,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: space(3),
    maxWidth: 300,
  },
  footer: { gap: space(4) },
  dots: { flexDirection: "row", justifyContent: "center", gap: space(2) },
  dot: { width: space(2), height: space(2), borderRadius: radius.pill, backgroundColor: colors.border },
  dotOn: { width: space(5), backgroundColor: colors.accent },
  btnWrap: { borderRadius: radius.md, overflow: "hidden" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
    paddingVertical: space(4),
    borderRadius: radius.md,
  },
  btnText: { fontFamily: fonts.sansBold, fontSize: 15, lineHeight: 20, color: colors.onAccent },
});
