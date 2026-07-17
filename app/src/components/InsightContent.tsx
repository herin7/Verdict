import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Badge } from "./Badge";
import { Timeline3D } from "./Timeline3D";
import { colors, font, fonts, iconSize, space } from "../theme";
import type { BestInCategory, LongTermScore, ScamDetector, VersionHistory } from "../types";

const verdictColorMap = { better: colors.buy, worse: colors.avoid, same: colors.textMuted } as const;
const verdictIconMap = {
  better: "arrow-up-circle" as const,
  worse: "arrow-down-circle" as const,
  same: "remove-circle" as const,
};
const riskColor = { low: colors.buy, medium: colors.wait, high: colors.avoid } as const;

const competitorIconMap = {
  better: "arrow-down-circle" as const,
  worse: "arrow-up-circle" as const,
  similar: "remove-circle" as const,
};
const competitorColorMap = { better: colors.avoid, worse: colors.buy, similar: colors.textMuted } as const;

export function LongTermContent({ data }: { data: LongTermScore }) {
  return (
    <View style={styles.stack}>
      <View style={styles.statRow}>
        <Badge
          label={data.trend}
          color={data.trend === "improving" ? colors.buy : data.trend === "declining" ? colors.avoid : colors.accent}
          icon={data.trend === "improving" ? "trending-up" : data.trend === "declining" ? "trending-down" : "remove"}
        />
      </View>

      <Timeline3D points={data.timeline} score={data.score} />

      <Text style={styles.summary}>{data.summary}</Text>
    </View>
  );
}

export function VersionHistoryContent({ data }: { data: VersionHistory }) {
  if (!data.hasPreviousVersion) {
    return (
      <View style={styles.gapSm}>
        <Text style={styles.summary}>{data.summary}</Text>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <View style={styles.statRow}>
        <Text style={styles.prevVersion}>vs {data.previousVersion}</Text>
        <Badge
          label={data.worthUpgrading === "yes" ? "Worth upgrading" : data.worthUpgrading === "no" ? "Skip it" : "N/A"}
          color={data.worthUpgrading === "yes" ? colors.buy : data.worthUpgrading === "no" ? colors.avoid : colors.textMuted}
        />
      </View>

      <View style={styles.gapSm}>
        {data.changes.map((c, i) => (
          <View key={i} style={styles.compareRow}>
            <Ionicons name={verdictIconMap[c.verdict]} size={iconSize.sm} color={verdictColorMap[c.verdict]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.aspectName}>{c.aspect}</Text>
              <Text style={styles.timelineNote}>{c.note}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.summary}>{data.summary}</Text>
    </View>
  );
}

export function ScamDetectorContent({ data }: { data: ScamDetector }) {
  return (
    <View style={styles.stack}>
      <View style={styles.statRow}>
        <Badge label={`${data.riskLevel} risk`} color={riskColor[data.riskLevel]} icon="shield-outline" />
        <Badge label={`counterfeit: ${data.counterfeitRisk}`} color={riskColor[data.counterfeitRisk]} />
        {data.fakeReviewEstimatePercent != null && (
          <Text style={styles.fakePercent}>~{data.fakeReviewEstimatePercent}% fake</Text>
        )}
      </View>

      {data.redFlags.length > 0 && (
        <View style={styles.gapXs}>
          {data.redFlags.map((f, i) => (
            <View key={i} style={styles.flagRow}>
              <Ionicons name="alert-circle-outline" size={iconSize.sm} color={colors.avoid} />
              <Text style={styles.timelineNote}>{f}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.summary}>{data.summary}</Text>
    </View>
  );
}

export function BestInCategoryContent({ data }: { data: BestInCategory }) {
  return (
    <View style={styles.stack}>
      <View style={styles.statRow}>
        <Text style={styles.bigStat}>{data.categoryScore}</Text>
        <Text style={styles.bigStatUnit}>/100</Text>
        <Badge label={data.rank} color={colors.accent} icon="trophy-outline" />
      </View>

      <View style={styles.gapSm}>
        {data.competitors.map((c, i) => (
          <View key={i} style={styles.compareRow}>
            <Ionicons name={competitorIconMap[c.comparison]} size={iconSize.sm} color={competitorColorMap[c.comparison]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.aspectName}>{c.name}</Text>
              <Text style={styles.timelineNote}>{c.note}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.summary}>{data.summary}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(3) },
  gapSm: { gap: space(2) },
  gapXs: { gap: space(1.5) },
  statRow: { flexDirection: "row", alignItems: "center", gap: space(2), flexWrap: "wrap" },
  bigStat: { fontFamily: fonts.monoBold, color: colors.accent, fontSize: 26, lineHeight: 30 },
  bigStatUnit: { ...font.caption, fontFamily: fonts.sansSemiBold, color: colors.textFaint, marginLeft: -space(1) },
  fakePercent: { ...font.monoSm, fontFamily: fonts.monoBold, color: colors.textMuted },
  prevVersion: { ...font.small, fontFamily: fonts.sansBold, color: colors.text },
  timelineNote: { ...font.caption, color: colors.textMuted, marginTop: space(0.25), lineHeight: 17 },
  compareRow: { flexDirection: "row", gap: space(2.5), alignItems: "flex-start" },
  aspectName: { ...font.small, fontFamily: fonts.sansBold, color: colors.text },
  flagRow: { flexDirection: "row", gap: space(2), alignItems: "flex-start" },
  summary: { ...font.small, fontFamily: fonts.sans, color: colors.textMuted, lineHeight: 19 },
});
