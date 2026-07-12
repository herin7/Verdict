import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ConsensusReport, ProductIdentity } from "../types";

const VERDICT_COLOR: Record<ConsensusReport["verdict"], string> = {
  buy: "#22c55e",
  wait: "#f59e0b",
  avoid: "#ef4444",
  mixed: "#8b5cf6",
};

export function ReportScreen({
  report,
  product,
  onBack,
}: {
  report: ConsensusReport;
  product: ProductIdentity;
  onBack: () => void;
}) {
  const color = VERDICT_COLOR[report.verdict];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.product}>{product.name}</Text>

      <View style={[styles.verdictCard, { borderColor: color }]}>
        <Text style={[styles.verdict, { color }]}>{report.verdict.toUpperCase()}</Text>
        <Text style={styles.score}>{report.score}/100</Text>
        <Text style={styles.verdictLine}>{report.verdictLine}</Text>
      </View>

      <Section title="Internet consensus">
        <Text style={styles.body}>{report.consensus}</Text>
      </Section>

      <Bullets title="Biggest pros" items={report.pros} tint="#22c55e" />
      <Bullets title="Biggest complaints" items={report.complaints} tint="#ef4444" />
      <Bullets title="Long-term ownership issues" items={report.longTermIssues} tint="#f59e0b" />
      <Bullets title="Common failures" items={report.commonFailures} tint="#ef4444" />

      <Section title="Fake / biased review signal">
        <Text style={styles.body}>
          [{report.fakeReviewSignal.level.toUpperCase()}] {report.fakeReviewSignal.note}
        </Text>
      </Section>

      <Section title="Price analysis">
        <Text style={styles.body}>{report.priceAnalysis.summary}</Text>
        <Text style={styles.meta}>
          Trend: {report.priceAnalysis.trend} - {report.priceAnalysis.shouldWaitForSale ? "Wait for a sale" : "Fine to buy now"}
        </Text>
        <Text style={styles.body}>{report.priceAnalysis.reason}</Text>
      </Section>

      {report.alternatives.length > 0 && (
        <Section title="Best alternatives">
          {report.alternatives.map((a, i) => (
            <Text key={i} style={styles.body}>
              <Text style={styles.bold}>{a.name}</Text> - {a.why}
            </Text>
          ))}
        </Section>
      )}

      <Section title="Buying advice">
        <Text style={styles.body}>{report.buyingAdvice}</Text>
      </Section>

      {report.sources.length > 0 && (
        <Section title="Sources">
          {report.sources.map((s, i) => (
            <Pressable key={i} onPress={() => Linking.openURL(s.url)}>
              <Text style={styles.link}>
                [{s.type}] {s.title}
              </Text>
            </Pressable>
          ))}
        </Section>
      )}

      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>Scan another</Text>
      </Pressable>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Bullets({ title, items, tint }: { title: string; items: string[]; tint: string }) {
  if (!items.length) return null;
  return (
    <Section title={title}>
      {items.map((it, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={[styles.bulletDot, { color: tint }]}>-</Text>
          <Text style={styles.body}>{it}</Text>
        </View>
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0b0f19" },
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  product: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 24 },
  verdictCard: { borderWidth: 2, borderRadius: 16, padding: 18, gap: 4, backgroundColor: "#111827" },
  verdict: { fontSize: 28, fontWeight: "900", letterSpacing: 1 },
  score: { color: "#e5e7eb", fontSize: 18, fontWeight: "700" },
  verdictLine: { color: "#d1d5db", fontSize: 15 },
  section: { gap: 8 },
  sectionTitle: { color: "#93c5fd", fontSize: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  body: { color: "#e5e7eb", fontSize: 15, lineHeight: 22 },
  meta: { color: "#9ca3af", fontSize: 13 },
  bold: { fontWeight: "700", color: "#fff" },
  bulletRow: { flexDirection: "row", gap: 8 },
  bulletDot: { fontSize: 15, fontWeight: "900" },
  link: { color: "#60a5fa", fontSize: 14, marginVertical: 3 },
  backBtn: { backgroundColor: "#3b82f6", padding: 16, borderRadius: 14, alignItems: "center", marginTop: 8 },
  backText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
