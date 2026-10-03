import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getInsight } from "../../api/client";
import { FadeIn } from "../../components/FadeIn";
import { Favicon } from "../../components/Favicon";
import { Icon } from "../../components/icons";
import { InsightCard } from "../../components/InsightCard";
import {
  BestInCategoryContent,
  LongTermContent,
  ScamDetectorContent,
  VersionHistoryContent,
} from "../../components/InsightContent";
import { Pill, Press, Text } from "../../components/ui";
import { openLink } from "../../lib/links";
import { colors, fonts, radius, space, verdictColor, verdictLabel, verdictSoft } from "../../theme";
import type { ConsensusReport, PersonalVerdict, ProductIdentity } from "../../types";
import { factorLabel } from "../profile/questions";
import { AlternativesSection } from "./AlternativesSection";
import { CollapsibleSection, EvidenceList, ReportSection } from "./ReportSection";

const level = {
  low: { label: "Low", color: colors.buy, bg: colors.buySoft },
  medium: { label: "Medium", color: colors.wait, bg: colors.waitSoft },
  high: { label: "High", color: colors.avoid, bg: colors.avoidSoft },
  unknown: { label: "Unknown", color: colors.textMuted, bg: colors.surfaceMuted },
} as const;

const frequencyColor = { common: colors.avoid, occasional: colors.wait, rare: colors.textMuted } as const;

/**
 * The finished verdict, top to bottom in the order a shopper asks the questions.
 * With a personal verdict, the hero is *their* answer and the general one sits
 * beneath it, followed by the evidence that decided it for them.
 */
export function ReportView({
  product,
  report,
  personal,
  footer,
}: {
  product: ProductIdentity;
  report: ConsensusReport;
  personal?: PersonalVerdict | null;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const verdict = personal?.verdict ?? report.verdict;
  const tint = verdictColor[verdict];

  return (
    <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space(8) }]}>
      <FadeIn style={styles.hero}>
        <Text variant="subhead">{product.brand ? `${product.brand} · ${product.category}` : product.category}</Text>
        <Text variant="display">{product.name}</Text>
        <View style={[styles.verdictBox, { backgroundColor: verdictSoft[verdict] }]}>
          {personal ? <Text variant="overline" style={{ color: tint }}>For you</Text> : null}
          <Text style={[styles.verdictWord, { color: tint }]}>{verdictLabel[verdict]}</Text>
          <Text variant="bodyStrong">{personal?.headline ?? report.verdictLine}</Text>
          {personal ? (
            <View style={styles.general}>
              <Text variant="caption">
                For most people: <Text variant="caption" style={{ color: verdictColor[report.verdict] }}>{verdictLabel[report.verdict]}</Text>
                {" · "}
                {report.verdictLine}
              </Text>
            </View>
          ) : null}
        </View>
      </FadeIn>

      {personal && (personal.matches.length || personal.conflicts.length) ? (
        <ReportSection title="Why, for you">
          <EvidenceList
            title="Fits what you care about"
            items={personal.matches}
            sources={report.sources}
            tint={colors.buy}
            icon={Icon.CheckCircle}
            meta={(i) => ({ label: factorLabel(personal.matches[i].factor).toUpperCase(), color: colors.textMuted })}
          />
          <EvidenceList
            title="Works against you"
            items={personal.conflicts}
            sources={report.sources}
            tint={colors.avoid}
            icon={Icon.Warning}
            meta={(i) => ({
              label: factorLabel(personal.conflicts[i].factor).toUpperCase(),
              color: personal.conflicts[i].strength === "strong" ? colors.avoid : colors.textMuted,
            })}
          />
        </ReportSection>
      ) : null}

      {report.bestFor.length || report.notFor.length ? (
        <ReportSection title="Who it's for">
          <Bullets title="Great for" items={report.bestFor} icon="good" />
          <Bullets title="Not ideal for" items={report.notFor} icon="bad" />
        </ReportSection>
      ) : null}

      {report.buyingAdvice ? (
        <ReportSection title="Should you buy it?">
          <Text variant="body">{report.buyingAdvice}</Text>
        </ReportSection>
      ) : null}

      <ReportSection title="What owners say">
        <Text variant="body">{report.summary}</Text>
        <EvidenceList title="Loved" items={report.pros} sources={report.sources} tint={colors.buy} icon={Icon.CheckCircle} />
        <EvidenceList title="Complaints" items={report.cons} sources={report.sources} tint={colors.avoid} icon={Icon.XCircle} />
      </ReportSection>

      {report.recurringIssues.length ? (
        <ReportSection title="Problems that keep coming up">
          <EvidenceList
            items={report.recurringIssues}
            sources={report.sources}
            tint={colors.wait}
            icon={Icon.Warning}
            meta={(i) => ({
              label: report.recurringIssues[i].frequency.toUpperCase(),
              color: frequencyColor[report.recurringIssues[i].frequency],
            })}
          />
        </ReportSection>
      ) : null}

      <ReportSection title="Risks">
        <View style={styles.row}>
          <Text variant="subhead" style={styles.flex}>
            Fake review risk
          </Text>
          <Pill
            label={level[report.fakeReviewRisk.level].label}
            color={level[report.fakeReviewRisk.level].color}
            background={level[report.fakeReviewRisk.level].bg}
          />
        </View>
        {report.fakeReviewRisk.note ? <Text variant="subhead">{report.fakeReviewRisk.note}</Text> : null}
        <EvidenceList
          items={report.risks}
          sources={report.sources}
          tint={colors.avoid}
          icon={Icon.ShieldWarning}
          meta={(i) => ({
            label: `${level[report.risks[i].severity].label.toUpperCase()} RISK`,
            color: level[report.risks[i].severity].color,
          })}
        />
      </ReportSection>

      {report.keySpecs.length ? (
        <ReportSection title="Key specs">
          <View style={styles.specs}>
            {report.keySpecs.map((spec) => (
              <View key={spec.label} style={styles.spec}>
                <Text variant="caption">{spec.label}</Text>
                <Text variant="bodyStrong">{spec.value}</Text>
              </View>
            ))}
          </View>
        </ReportSection>
      ) : null}

      <AlternativesSection alternatives={report.alternatives} />

      {footer}

      <View style={styles.deeper}>
        <Text variant="overline">Go deeper</Text>
        <InsightCard
          icon={Icon.Clock}
          title="After a year of use"
          teaser="How owners feel months later"
          fetcher={() => getInsight("long-term", product)}
          renderContent={(data) => <LongTermContent data={data} />}
        />
        <InsightCard
          icon={Icon.GitDiff}
          title="Versus the last model"
          teaser="What changed and whether it's worth upgrading"
          fetcher={() => getInsight("version-history", product)}
          renderContent={(data) => <VersionHistoryContent data={data} />}
        />
        <InsightCard
          icon={Icon.ShieldCheck}
          title="Fakes and scams"
          teaser="Fake reviews and counterfeit risk"
          fetcher={() => getInsight("scam-detector", product)}
          renderContent={(data) => <ScamDetectorContent data={data} />}
        />
        <InsightCard
          icon={Icon.Trophy}
          title="Best in its category?"
          teaser="How it stacks up against rivals"
          fetcher={() => getInsight("best-in-category", product)}
          renderContent={(data) => <BestInCategoryContent data={data} />}
        />
      </View>

      {report.sources.length ? (
        <CollapsibleSection title="Sources" preview={`${report.sources.length} reviews and owner reports`}>
          {report.sources.map((source, i) => (
            <Press
              key={source.url}
              onPress={() => void openLink(source.url)}
              style={styles.source}
              accessibilityRole="link"
              accessibilityLabel={`Source ${i + 1}: ${source.title}`}
            >
              <Text variant="caption" style={styles.sourceNumber}>
                {i + 1}
              </Text>
              <Favicon url={source.url} />
              <Text variant="subhead" style={styles.flex} numberOfLines={2}>
                {source.title}
              </Text>
            </Press>
          ))}
        </CollapsibleSection>
      ) : null}
    </ScrollView>
  );
}

function Bullets({ title, items, icon }: { title: string; items: string[]; icon: "good" | "bad" }) {
  if (items.length === 0) return null;
  const Glyph = icon === "good" ? Icon.CheckCircle : Icon.XCircle;
  const tint = icon === "good" ? colors.buy : colors.textFaint;
  return (
    <View style={styles.bullets}>
      <Text variant="overline">{title}</Text>
      {items.map((item) => (
        <View key={item} style={styles.row}>
          <Glyph size={18} color={tint} weight="fill" />
          <Text variant="body" style={styles.flex}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: space(4), gap: space(4) },
  hero: { gap: space(2), paddingVertical: space(2) },
  verdictBox: { marginTop: space(2), padding: space(4), gap: space(1), borderRadius: radius.lg, borderCurve: "continuous" },
  general: { marginTop: space(2), paddingTop: space(2), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  verdictWord: { fontFamily: fonts.extrabold, fontSize: 40, lineHeight: 46, letterSpacing: -1 },
  row: { flexDirection: "row", alignItems: "center", gap: space(3) },
  bullets: { gap: space(2) },
  specs: { flexDirection: "row", flexWrap: "wrap", gap: space(3) },
  spec: {
    width: "47%",
    padding: space(3),
    gap: space(0.5),
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  deeper: { gap: space(3) },
  source: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(1.5) },
  sourceNumber: { width: 18, textAlign: "right", fontFamily: fonts.bold },
});
