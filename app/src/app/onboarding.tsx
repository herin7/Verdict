import { useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, View, useWindowDimensions, type ViewToken } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconComponent } from "@/components/icons";
import { Button, Press, Text } from "@/components/ui";
import { useSession } from "@/features/auth/session";
import { colors, motion, radius, space } from "@/theme";

const SLIDES: { key: string; icon: IconComponent; title: string; body: string }[] = [
  {
    key: "share",
    icon: Icon.ShareNetwork,
    title: "Share anything\nyou're about to buy",
    body: "In any app, tap Share and pick Verdict: a link, a screenshot, or just a name.",
  },
  {
    key: "research",
    icon: Icon.ChatsCircle,
    title: "We read the reviews\nso you don't have to",
    body: "Owner forums, expert reviews, recurring problems and fake-review signals, read for you.",
  },
  {
    key: "decide",
    icon: Icon.SealCheck,
    title: "Buy it, skip it,\nor it depends",
    body: "We'll ping you with a clear verdict, who it suits, and every claim linked to its source.",
  },
];

export default function Onboarding() {
  const { completeOnboarding } = useSession();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  }).current;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space(3), paddingBottom: insets.bottom + space(4) }]}>
      <View style={styles.top}>
        <Text variant="title" style={styles.onPrimary}>
          Verdict
        </Text>
        {!last ? (
          <Press onPress={completeOnboarding} accessibilityLabel="Skip introduction" style={styles.skip}>
            <Text variant="bodyStrong" style={styles.onPrimary}>
              Skip
            </Text>
          </Press>
        ) : null}
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
        renderItem={({ item, index: i }) => (
          <View style={[styles.slide, { width }]}>
            <SlideArt icon={item.icon} active={i === index} />
            <Text variant="display" style={[styles.onPrimary, styles.title]}>
              {item.title}
            </Text>
            <Text variant="body" style={styles.body}>
              {item.body}
            </Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
        <Button
          label={last ? "Get started" : "Next"}
          variant="accent"
          size="lg"
          icon={last ? Icon.ArrowRight : undefined}
          onPress={() => (last ? completeOnboarding() : listRef.current?.scrollToIndex({ index: index + 1 }))}
        />
      </View>
    </View>
  );
}

function SlideArt({ icon: Glyph, active }: { icon: IconComponent; active: boolean }) {
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: motion.slow });
  }, [active, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + progress.value * 0.6,
    transform: [{ scale: 0.9 + progress.value * 0.1 }, { rotate: `${(1 - progress.value) * -8}deg` }],
  }));
  return (
    <Animated.View style={[styles.art, style]}>
      <View style={styles.artInner}>
        <Glyph size={72} color={colors.primary} weight="duotone" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    experimental_backgroundImage: `linear-gradient(180deg, ${colors.primary} 0%, ${colors.primaryDeep} 100%)`,
  },
  onPrimary: { color: colors.onPrimary },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space(5), minHeight: 44 },
  skip: { padding: space(2) },
  slide: { flex: 1, justifyContent: "center", paddingHorizontal: space(6), gap: space(4) },
  title: { fontSize: 32, lineHeight: 38 },
  body: { color: colors.onPrimary, opacity: 0.8 },
  art: { width: 168, height: 168, borderRadius: radius.xl, padding: space(3), backgroundColor: colors.accent, marginBottom: space(4) },
  artInner: {
    flex: 1,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  footer: { paddingHorizontal: space(5), gap: space(6) },
  dots: { flexDirection: "row", gap: space(2) },
  dot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.3)" },
  dotOn: { width: 28, backgroundColor: colors.accent },
});
