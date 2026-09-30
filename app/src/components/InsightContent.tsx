import { StyleSheet, View } from "react-native";
import { Icon, type IconComponent } from "./icons";
import { SentimentTimeline } from "./SentimentTimeline";
import { Pill, Text } from "./ui";
import { colors, iconSize, space } from "../theme";
import type { BestInCategory, LongTermScore, ScamDetector, VersionHistory } from "../types";

const risk = {
  low: { color: colors.buy, bg: colors.buySoft },
  medium: { color: colors.wait, bg: colors.waitSoft },
  high: { color: colors.avoid, bg: colors.avoidSoft },
} as const;

function Row({ icon: Glyph, color, title, note }: { icon: IconComponent; color: string; title: string; note: string }) {
  return (
    <View style={styles.row}>
      <Glyph size={iconSize.md} color={color} weight="fill" />
      <View style={styles.flex}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="subhead">{note}</Text>
      </View>
    </View>
  );
}

export function LongTermContent({ data }: { data: LongTermScore }) {
  const up = data.trend === "improving";
  const down = data.trend === "declining";
  return (
    <View style={styles.stack}>
      <View style={styles.pills}>
        <Pill
          label={`Long-term ${Math.round(data.score)}/100`}
          color={colors.primary}
          background={colors.primarySoft}
        />
        <Pill
          label={data.trend}
          icon={up ? Icon.TrendUp : down ? Icon.TrendDown : Icon.Minus}
          color={up ? colors.buy : down ? colors.avoid : colors.textMuted}
          background={up ? colors.buySoft : down ? colors.avoidSoft : colors.surfaceMuted}
        />
      </View>
      <SentimentTimeline points={data.timeline} />
      <Text variant="subhead">{data.summary}</Text>
    </View>
  );
}

export function VersionHistoryContent({ data }: { data: VersionHistory }) {
  if (!data.hasPreviousVersion) return <Text variant="subhead">{data.summary}</Text>;
  const worth = data.worthUpgrading;
  return (
    <View style={styles.stack}>
      <View style={styles.pills}>
        <Pill label={`vs ${data.previousVersion}`} />
        {worth !== "not_applicable" ? (
          <Pill
            label={worth === "yes" ? "Worth upgrading" : "Not worth upgrading"}
            color={worth === "yes" ? colors.buy : colors.avoid}
            background={worth === "yes" ? colors.buySoft : colors.avoidSoft}
          />
        ) : null}
      </View>
      {data.changes.map((c, i) => (
        <Row
          key={i}
          icon={c.verdict === "better" ? Icon.CheckCircle : c.verdict === "worse" ? Icon.XCircle : Icon.Minus}
          color={c.verdict === "better" ? colors.buy : c.verdict === "worse" ? colors.avoid : colors.textFaint}
          title={c.aspect}
          note={c.note}
        />
      ))}
      <Text variant="subhead">{data.summary}</Text>
    </View>
  );
}

export function ScamDetectorContent({ data }: { data: ScamDetector }) {
  return (
    <View style={styles.stack}>
      <View style={styles.pills}>
        <Pill label={`${data.riskLevel} risk`} icon={Icon.ShieldWarning} color={risk[data.riskLevel].color} background={risk[data.riskLevel].bg} />
        <Pill
          label={`Counterfeit ${data.counterfeitRisk}`}
          color={risk[data.counterfeitRisk].color}
          background={risk[data.counterfeitRisk].bg}
        />
        {data.fakeReviewEstimatePercent != null ? <Pill label={`~${data.fakeReviewEstimatePercent}% fake reviews`} /> : null}
      </View>
      {data.redFlags.map((flag, i) => (
        <View key={i} style={styles.row}>
          <Icon.Warning size={iconSize.md} color={colors.avoid} weight="fill" />
          <Text variant="body" style={styles.flex}>
            {flag}
          </Text>
        </View>
      ))}
      <Text variant="subhead">{data.summary}</Text>
    </View>
  );
}

export function BestInCategoryContent({ data }: { data: BestInCategory }) {
  return (
    <View style={styles.stack}>
      <View style={styles.pills}>
        <Pill label={data.rank} icon={Icon.Trophy} color={colors.onAccent} background={colors.accent} />
        <Pill label={`${data.categoryScore}/100 in category`} />
      </View>
      {data.competitors.map((c, i) => (
        <Row
          key={i}
          // "better" means the competitor beats this product
          icon={c.comparison === "better" ? Icon.TrendUp : c.comparison === "worse" ? Icon.TrendDown : Icon.Minus}
          color={c.comparison === "better" ? colors.avoid : c.comparison === "worse" ? colors.buy : colors.textFaint}
          title={c.name}
          note={c.note}
        />
      ))}
      <Text variant="subhead">{data.summary}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: space(3) },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  row: { flexDirection: "row", gap: space(3), alignItems: "flex-start" },
});
