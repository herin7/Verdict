import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Badge } from "./Badge";
import { colors, fonts } from "../theme";
import type { BestInCategory, LongTermScore, ScamDetector, VersionHistory } from "../types";

const sentimentColor = { positive: colors.buy, negative: colors.avoid, mixed: colors.mixed } as const;
const verdictColorMap = { better: colors.buy, worse: colors.avoid, same: colors.textMuted } as const;
const verdictIconMap = {
  better: "arrow-up-circle" as const,
  worse: "arrow-down-circle" as const,
  same: "remove-circle" as const,
};
const riskColor = { low: colors.buy, medium: colors.wait, high: colors.avoid } as const;

// A competitor being "better" than our product is bad news for the verdict, and
// vice versa - so the icon/color is inverted relative to the raw comparison value.
const competitorIconMap = {
  better: "arrow-down-circle" as const,
  worse: "arrow-up-circle" as const,
  similar: "remove-circle" as const,
};
const competitorColorMap = { better: colors.avoid, worse: colors.buy, similar: colors.textMuted } as const;

export function LongTermContent({ data }: { data: LongTermScore }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.statRow}>
        <Text style={styles.bigStat}>{data.score}</Text>
        <Text style={styles.bigStatUnit}>/100</Text>
        <Badge
          label={data.trend}
          color={data.trend === "improving" ? colors.buy : data.trend === "declining" ? colors.avoid : colors.accent}
          icon={data.trend === "improving" ? "trending-up" : data.trend === "declining" ? "trending-down" : "remove"}
        />
      </View>

      <View style={{ gap: 8 }}>
        {data.timeline.map((t, i) => (
          <View key={i} style={styles.timelineRow}>
            <View style={[styles.timelineDot, { backgroundColor: sentimentColor[t.sentiment] }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.timelinePeriod}>{t.period}</Text>
              <Text style={styles.timelineNote}>{t.note}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.summary}>{data.summary}</Text>
    </View>
  );
}

export function VersionHistoryContent({ data }: { data: VersionHistory }) {
  if (!data.hasPreviousVersion) {
    return (
      <View style={{ gap: 8 }}>
        <Text style={styles.summary}>{data.summary}</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.statRow}>
        <Text style={styles.prevVersion}>vs {data.previousVersion}</Text>
        <Badge
          label={data.worthUpgrading === "yes" ? "Worth upgrading" : data.worthUpgrading === "no" ? "Skip it" : "N/A"}
          color={data.worthUpgrading === "yes" ? colors.buy : data.worthUpgrading === "no" ? colors.avoid : colors.textMuted}
        />
      </View>

      <View style={{ gap: 8 }}>
        {data.changes.map((c, i) => (
          <View key={i} style={styles.compareRow}>
            <Ionicons name={verdictIconMap[c.verdict]} size={16} color={verdictColorMap[c.verdict]} />
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
    <View style={{ gap: 12 }}>
      <View style={styles.statRow}>
        <Badge label={`${data.riskLevel} risk`} color={riskColor[data.riskLevel]} icon="shield-outline" />
        <Badge label={`counterfeit: ${data.counterfeitRisk}`} color={riskColor[data.counterfeitRisk]} />
        {data.fakeReviewEstimatePercent != null && (
          <Text style={styles.fakePercent}>~{data.fakeReviewEstimatePercent}% fake</Text>
        )}
      </View>

      {data.redFlags.length > 0 && (
        <View style={{ gap: 6 }}>
          {data.redFlags.map((f, i) => (
            <View key={i} style={styles.flagRow}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.avoid} />
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
    <View style={{ gap: 12 }}>
      <View style={styles.statRow}>
        <Text style={styles.bigStat}>{data.categoryScore}</Text>
        <Text style={styles.bigStatUnit}>/100</Text>
        <Badge label={data.rank} color={colors.accent} icon="trophy-outline" />
      </View>

      <View style={{ gap: 8 }}>
        {data.competitors.map((c, i) => (
          <View key={i} style={styles.compareRow}>
            <Ionicons name={competitorIconMap[c.comparison]} size={16} color={competitorColorMap[c.comparison]} />
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
  statRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  bigStat: { fontFamily: fonts.monoBold, color: colors.accent, fontSize: 26 },
  bigStatUnit: { fontFamily: fonts.sansSemiBold, color: colors.textFaint, fontSize: 12, marginLeft: -4 },
  fakePercent: { fontFamily: fonts.monoBold, color: colors.textMuted, fontSize: 12.5 },
  prevVersion: { fontFamily: fonts.sansBold, color: colors.text, fontSize: 14 },

  timelineRow: { flexDirection: "row", gap: 10 },
  timelineDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  timelinePeriod: { fontFamily: fonts.sansBold, color: colors.text, fontSize: 13 },
  timelineNote: { fontFamily: fonts.sans, color: colors.textMuted, fontSize: 12.5, marginTop: 1, lineHeight: 17 },

  compareRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  aspectName: { fontFamily: fonts.sansBold, color: colors.text, fontSize: 13 },

  flagRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },

  summary: { fontFamily: fonts.sans, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
});
