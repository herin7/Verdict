import { useRef, useState } from "react";
import {
  Dimensions,
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
import { Canvas, Circle, Group, LinearGradient as SkiaGradient, vec } from "@shopify/react-native-skia";
import { MotiView } from "moti";
import { Tappable } from "../components/Tappable";
import { colors, fonts, goldGradient, motion, radius, space } from "../theme";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    key: "scan",
    icon: "scan-outline" as const,
    title: "Point. Identify.",
    body: "Snap any product. Verdict reads the photo and names it in seconds.",
  },
  {
    key: "consensus",
    icon: "planet-outline" as const,
    title: "Internet consensus.",
    body: "Not one review. The whole web - Reddit, retail, forums, price history - distilled.",
  },
  {
    key: "decide",
    icon: "flash-outline" as const,
    title: "Buy with clarity.",
    body: "Verdict, risks, alternatives, and cross-platform prices. Decision ready.",
  },
];

function OrbArt() {
  return (
    <Canvas style={styles.canvas}>
      <Group>
        <Circle cx={width * 0.5} cy={110} r={90}>
          <SkiaGradient
            start={vec(width * 0.3, 40)}
            end={vec(width * 0.7, 180)}
            colors={["rgba(255,215,109,0.55)", "rgba(255,215,109,0.05)", "transparent"]}
          />
        </Circle>
        <Circle cx={width * 0.32} cy={150} r={42} color="rgba(255,215,109,0.18)" />
        <Circle cx={width * 0.68} cy={70} r={28} color="rgba(255,215,109,0.22)" />
      </Group>
    </Canvas>
  );
}

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

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
      <OrbArt />
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
          <View style={styles.slide}>
            <MotiView
              from={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: i === index ? 1 : 0.4, scale: i === index ? 1 : 0.94 }}
              transition={{ type: "timing", duration: motion.normal }}
              style={styles.iconWrap}
            >
              <Ionicons name={item.icon} size={36} color={colors.accent} />
            </MotiView>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
        <Tappable onPress={next} style={styles.btnWrap}>
          <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
            <Text style={styles.btnText}>{index === SLIDES.length - 1 ? "Get started" : "Next"}</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.onAccent} />
          </LinearGradient>
        </Tappable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  canvas: { position: "absolute", top: 40, left: 0, right: 0, height: 220 },
  slide: {
    width,
    paddingHorizontal: space(8),
    paddingTop: 220,
    alignItems: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: "rgba(255,215,109,0.28)",
    marginBottom: 22,
  },
  title: { fontFamily: fonts.serif, fontSize: 34, color: colors.text, textAlign: "center", lineHeight: 38 },
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 14,
    maxWidth: 300,
  },
  footer: { paddingHorizontal: space(8), paddingBottom: 48, gap: 18 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.18)" },
  dotOn: { width: 22, backgroundColor: colors.accent },
  btnWrap: { borderRadius: radius.md, overflow: "hidden" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: radius.md,
  },
  btnText: { fontFamily: fonts.sansBold, fontSize: 15.5, color: colors.onAccent },
});
