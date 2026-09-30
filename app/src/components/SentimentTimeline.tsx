import { StyleSheet, View } from "react-native";
import { Text } from "./ui";
import Svg, { Polyline } from "react-native-svg";
import { colors, radius, space } from "../theme";
import type { LongTermScore } from "../types";

type Point = LongTermScore["timeline"][number];

// Chart is drawn in a fixed 100x40 viewBox and stretched to the container width,
// so it never needs to measure itself.
const VIEW_W = 100;
const VIEW_H = 40;
const CHART_H = 96;
const DOT = 10;
const SENTIMENT_Y: Record<Point["sentiment"], number> = { positive: 8, mixed: 20, negative: 32 };

/** Owner sentiment over time (week 1 → years in). Renders nothing without data. */
export function SentimentTimeline({ points }: { points: Point[] }) {
  if (points.length === 0) return null;

  const step = points.length > 1 ? (VIEW_W - 8) / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: points.length > 1 ? 4 + i * step : VIEW_W / 2,
    y: SENTIMENT_Y[p.sentiment],
  }));

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`Owner sentiment over time: ${points
        .map((p) => `${p.period} ${p.sentiment}`)
        .join(", ")}`}
    >
      <View style={styles.chart}>
      <Svg width="100%" height={CHART_H} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none">
        <Polyline
          points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none"
          stroke={colors.primary}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </Svg>
        {coords.map((c, i) => (
          <View
            key={i}
            style={[styles.dot, { left: `${c.x}%`, top: (c.y / VIEW_H) * CHART_H - DOT / 2 }]}
          />
        ))}
      </View>
      <View style={styles.labels}>
        {points.map((p, i) => (
          <Text key={i} variant="caption" style={styles.label} numberOfLines={1}>
            {p.period}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space(1.5) },
  chart: { height: CHART_H },
  dot: {
    position: "absolute",
    width: DOT,
    height: DOT,
    marginLeft: -DOT / 2,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  labels: { flexDirection: "row", justifyContent: "space-between" },
  label: { flex: 1, textAlign: "center" },
});
