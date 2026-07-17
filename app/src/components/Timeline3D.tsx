import { StyleSheet, Text, View } from "react-native";
import { Canvas, Circle, Group, Line, LinearGradient, Path, Skia, vec } from "@shopify/react-native-skia";
import { MotiView } from "moti";
import { colors, font, fonts, motion, space } from "../theme";

type Point = { period: string; sentiment: "positive" | "negative" | "mixed"; note: string };

const SENTIMENT_Y: Record<Point["sentiment"], number> = {
  positive: 28,
  mixed: 56,
  negative: 84,
};

/** Layered depth timeline for ownership sentiment over time. */
export function Timeline3D({
  points,
  score,
  height = 132,
}: {
  points: Point[];
  score?: number;
  height?: number;
}) {
  const width = 320;

  const data = points.length
    ? points
    : [
        { period: "Week 1", sentiment: "mixed" as const, note: "" },
        { period: "Month 3", sentiment: "positive" as const, note: "" },
        { period: "Year 1", sentiment: "mixed" as const, note: "" },
      ];

  const coords = data.map((p, i) => {
    const x = 28 + (i * (width - 56)) / Math.max(data.length - 1, 1);
    const y = SENTIMENT_Y[p.sentiment];
    return { x, y, ...p };
  });

  const path = Skia.Path.Make();
  coords.forEach((c, i) => {
    if (i === 0) path.moveTo(c.x, c.y);
    else path.lineTo(c.x, c.y);
  });

  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: motion.slow }}
      style={styles.wrap}
    >
      <Canvas style={{ width: "100%", height }}>
        <Group>
          <Path path={path} style="stroke" strokeWidth={10} color={colors.accentSoft} strokeCap="round" />
          <Path path={path} style="stroke" strokeWidth={5} color={colors.border} strokeCap="round" />
          <Path path={path} style="stroke" strokeWidth={2.5} strokeCap="round">
            <LinearGradient start={vec(0, 0)} end={vec(width, 0)} colors={[colors.accent, colors.buy]} />
          </Path>

          {coords.map((c, i) => (
            <Group key={i}>
              <Circle cx={c.x} cy={c.y + 2} r={7} color={colors.border} />
              <Circle cx={c.x} cy={c.y} r={6} color={colors.bgElevated} />
              <Circle cx={c.x} cy={c.y} r={3.5} color={colors.accent} />
              <Line p1={vec(c.x, 108)} p2={vec(c.x, c.y + 10)} color={colors.border} strokeWidth={1} />
            </Group>
          ))}
        </Group>
      </Canvas>
      <View style={styles.labels}>
        {coords.map((c, i) => (
          <Text key={i} style={styles.label} numberOfLines={1}>
            {c.period}
          </Text>
        ))}
      </View>
      {typeof score === "number" && (
        <Text style={styles.scoreLine}>
          Long-term <Text style={styles.scoreNum}>{Math.round(score)}</Text>
        </Text>
      )}
    </MotiView>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space(1.5) },
  labels: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space(2) },
  label: { ...font.caption, fontFamily: fonts.sansSemiBold, color: colors.textFaint, flex: 1, textAlign: "center" },
  scoreLine: { ...font.caption, fontFamily: fonts.sansSemiBold, color: colors.textMuted, marginTop: space(1) },
  scoreNum: { ...font.monoSm, fontFamily: fonts.monoBold, color: colors.accent },
});
