import { useRef, useState } from "react";
import {
  LayoutAnimation,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassCard } from "../components/GlassCard";
import { Tappable } from "../components/Tappable";
import { Badge } from "../components/Badge";
import { ScoreGauge } from "../components/ScoreGauge";
import { Favicon, SourceTypeIcon } from "../components/Icons";
import { PriceText } from "../components/PriceText";
import { RetailerMark } from "../components/RetailerMark";
import { VintageIcon } from "../components/VintageIcon";
import { InsightCard } from "../components/InsightCard";
import { CompareDealsSection } from "../components/CompareDealsSection";
import { VerdictTicket } from "../components/VerdictTicket";
import { LoadingState } from "../components/ui";
import {
  BestInCategoryContent,
  LongTermContent,
  ScamDetectorContent,
  VersionHistoryContent,
} from "../components/InsightContent";
import { colors, ctaGradient, font, fonts, radius, space, verdictColor, verdictLabel } from "../theme";
import { findBuyLinks, getInsight } from "../api/client";
import { openRetailer } from "../deeplink";
import type { BuyLink, ConsensusReport, ProductIdentity } from "../types";

const FAKE_SIGNAL_COLOR: Record<ConsensusReport["fakeReviewSignal"]["level"], string> = {
  low: colors.buy,
  medium: colors.wait,
  high: colors.avoid,
  unknown: colors.textMuted,
};

const TREND_ICON: Record<ConsensusReport["priceAnalysis"]["trend"], keyof typeof Ionicons.glyphMap> = {
  rising: "trending-up-outline",
  falling: "trending-down-outline",
  stable: "remove-outline",
  unknown: "help-circle-outline",
};

interface AltBuyState {
  loading: boolean;
  links?: BuyLink[];
  error?: boolean;
}

function buyAmount(link: BuyLink): number | null {
  if (typeof link.amount === "number" && link.amount > 0) return link.amount;
  if (!link.price) return null;
  const digits = link.price.replace(/[^\d.]/g, "");
  const n = parseFloat(digits);
  return Number.isFinite(n) ? n : null;
}

/** Cheapest-first, priced before unpriced. */
function sortByPrice(links: BuyLink[]): BuyLink[] {
  return [...links].sort((a, b) => {
    const pa = buyAmount(a);
    const pb = buyAmount(b);
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pa - pb;
  });
}

export function ReportScreen({
  report,
  product,
  buyLinks,
  isSaved,
  onBack,
  onToggleSave,
  referencePrice,
  productIds,
}: {
  report: ConsensusReport;
  product: ProductIdentity;
  buyLinks: BuyLink[];
  isSaved: boolean;
  onBack: () => void;
  onToggleSave: () => void;
  referencePrice?: import("../types").ReferencePrice | null;
  productIds?: {
    asin?: string | null;
    fsn?: string | null;
    flipkartItemId?: string | null;
  } | null;
}) {
  const color = verdictColor[report.verdict];
  const shotRef = useRef<ViewShotRef>(null);
  const [altBuy, setAltBuy] = useState<Record<number, AltBuyState>>({});
  const insets = useSafeAreaInsets();

  async function findAltBuyLinks(i: number, altName: string) {
    setAltBuy((s) => ({ ...s, [i]: { loading: true } }));
    try {
      const links = await findBuyLinks(`${altName} ${product.category}`);
      setAltBuy((s) => ({ ...s, [i]: { loading: false, links } }));
    } catch {
      setAltBuy((s) => ({ ...s, [i]: { loading: false, error: true } }));
    }
  }

  async function handleShare() {
    try {
      const uri = await shotRef.current?.capture?.();
      if (uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, {
          dialogTitle: `${product.name} - Verdict report`,
          mimeType: "image/png",
          UTI: "public.png",
        });
        return;
      }
    } catch {
      // fall through to text share
    }
    const summary = `${product.name}\n${verdictLabel[report.verdict]} - ${report.score}/100\n\n${report.verdictLine}\n\n${report.buyingAdvice}\n\nvia Verdict`;
    Share.share({ message: summary }).catch(() => {});
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space(3), paddingBottom: space(10) + insets.bottom },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Tappable onPress={onBack} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Tappable>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>RESEARCH REPORT</Text>
          <Text style={styles.product} numberOfLines={2}>
            {product.name}
          </Text>
        </View>
        <Tappable onPress={handleShare} style={styles.iconBtn}>
          <Ionicons name="share-outline" size={18} color={colors.text} />
        </Tappable>
        <Tappable onPress={onToggleSave} style={styles.iconBtn}>
          <Ionicons
            name={isSaved ? "bookmark" : "bookmark-outline"}
            size={18}
            color={isSaved ? colors.accent : colors.text}
          />
        </Tappable>
      </View>

      <ViewShot ref={shotRef} options={{ format: "png", quality: 0.95 }}>
        <View style={styles.heroWrap}>
          <VerdictTicket
            verdict={report.verdict}
            productTitle={product.name}
            headline={report.verdictLine}
            sourceCount={report.sources?.length}
          />
          <View style={styles.gaugeRow}>
            <ScoreGauge score={report.score} color={color} />
            <View style={{ flex: 1, gap: space(1) }}>
              <Text style={styles.scoreLabel}>Consensus score</Text>
              <Text style={styles.scoreHint}>Based on reviews, forums and price history across the web.</Text>
            </View>
          </View>
        </View>
      </ViewShot>

      {buyLinks.length > 0 && (
        <Section icon="cart-outline" title="Buy now">
          {(() => {
            const sorted = sortByPrice(buyLinks);
            const pricedCount = sorted.filter((b) => buyAmount(b) != null).length;
            const bestUrl = pricedCount > 1 ? sorted[0]!.url : null;
            return (
              <>
                {pricedCount > 0 && (
                  <Text style={styles.buyCompareLine}>
                    Compared across {sorted.length} platform{sorted.length === 1 ? "" : "s"}
                    {bestUrl && sorted[0] ? ` - lowest priced option highlighted` : ""}
                  </Text>
                )}
                {sorted.map((b, i) => (
                  <Tappable
                    key={i}
                    onPress={() => openRetailer(b.url)}
                    style={[styles.buyRow, i === 0 && styles.sourceRowFirst]}
                  >
                    <RetailerMark retailerId={b.retailerId} name={b.retailer} url={b.url} showName={false} size={26} />
                    <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                      <View style={styles.buyRetailerRow}>
                        <Text style={styles.buyRetailer} numberOfLines={1}>
                          {b.retailer}
                        </Text>
                        {b.url === bestUrl && <Badge label="Best price" color={colors.buy} />}
                      </View>
                      <Text style={styles.buyTitle} numberOfLines={1}>
                        {b.title}
                      </Text>
                    </View>
                    {buyAmount(b) != null ? (
                      <View style={[styles.buyPriceTag, b.url === bestUrl && styles.buyPriceTagBest]}>
                        <PriceText
                          amount={buyAmount(b)}
                          currency={b.currency ?? "INR"}
                          style={[styles.buyPrice, b.url === bestUrl && styles.buyPriceBest]}
                        />
                      </View>
                    ) : (
                      <View style={styles.buyCta}>
                        <Text style={styles.buyCtaText}>Open</Text>
                        <Ionicons name="arrow-forward" size={12} color={colors.onAccent} />
                      </View>
                    )}
                  </Tappable>
                ))}
              </>
            );
          })()}
        </Section>
      )}

      <CompareDealsSection product={product} referencePrice={referencePrice} productIds={productIds} />

      <Section icon="chatbubble-ellipses-outline" title="Internet consensus">
        <Text style={styles.body} numberOfLines={6}>
          {report.consensus}
        </Text>
      </Section>

      <View style={styles.twoCol}>
        <Bullets
          title="Pros"
          items={report.pros}
          tint={colors.buy}
          icon="checkmark-circle"
          style={styles.colHalf}
        />
        <Bullets
          title="Complaints"
          items={report.complaints}
          tint={colors.avoid}
          icon="close-circle"
          style={styles.colHalf}
        />
      </View>

      <GlassCard style={styles.section}>
        <View style={styles.sectionHeader}>
          <VintageIcon name="shield-checkmark-outline" />
          <Text style={styles.sectionTitle}>Trust & price</Text>
        </View>
        <View style={styles.priceRow}>
          <Badge
            label={`${report.fakeReviewSignal.level} fake-review risk`}
            color={FAKE_SIGNAL_COLOR[report.fakeReviewSignal.level]}
            icon="alert-circle-outline"
          />
          <Badge
            label={report.priceAnalysis.trend}
            color={colors.accent}
            icon={TREND_ICON[report.priceAnalysis.trend]}
          />
          <Badge
            label={report.priceAnalysis.shouldWaitForSale ? "Wait for sale" : "Buy now is fine"}
            color={report.priceAnalysis.shouldWaitForSale ? colors.wait : colors.buy}
            icon={report.priceAnalysis.shouldWaitForSale ? "time-outline" : "checkmark-outline"}
          />
        </View>
        <Text style={[styles.body, styles.compactBody]} numberOfLines={3}>
          {report.priceAnalysis.summary} {report.priceAnalysis.reason}
        </Text>
        <Text style={[styles.body, styles.compactBody, { color: colors.textMuted }]} numberOfLines={2}>
          {report.fakeReviewSignal.note}
        </Text>
      </GlassCard>

      {(report.longTermIssues.length > 0 || report.commonFailures.length > 0) && (
        <CollapsibleSection
          icon="hourglass-outline"
          title="Known issues"
          preview={`${report.longTermIssues.length + report.commonFailures.length} issue${
            report.longTermIssues.length + report.commonFailures.length === 1 ? "" : "s"
          } reported by long-term owners`}
        >
          <SubBullets title="Long-term ownership" items={report.longTermIssues} tint={colors.wait} icon="hourglass-outline" />
          <SubBullets title="Common failures" items={report.commonFailures} tint={colors.avoid} icon="warning-outline" />
        </CollapsibleSection>
      )}

      {report.alternatives.length > 0 && (
        <Section icon="swap-horizontal-outline" title="Best alternatives">
          <ExpandableAlternatives
            alternatives={report.alternatives}
            altBuy={altBuy}
            onFindBuyLinks={findAltBuyLinks}
          />
        </Section>
      )}

      <View style={styles.deepDiveSection}>
        <View style={styles.sectionHeader}>
          <VintageIcon name="layers-outline" />
          <Text style={styles.sectionTitle}>Deep dive</Text>
        </View>

        <InsightCard
          icon="trending-up-outline"
          title="Long-term score"
          teaser="How opinions change after weeks, months, years"
          fetcher={() => getInsight("long-term", product)}
          renderContent={(data) => <LongTermContent data={data} />}
        />
        <InsightCard
          icon="layers-outline"
          title="Internet memory"
          teaser="Compared with previous versions"
          fetcher={() => getInsight("version-history", product)}
          renderContent={(data) => <VersionHistoryContent data={data} />}
        />
        <InsightCard
          icon="shield-checkmark-outline"
          title="Scam detector"
          teaser="Fake reviews, counterfeits, suspicious sellers"
          fetcher={() => getInsight("scam-detector", product)}
          renderContent={(data) => <ScamDetectorContent data={data} />}
        />
        <InsightCard
          icon="trophy-outline"
          title="Best in category"
          teaser="Ranked against its closest competitors"
          fetcher={() => getInsight("best-in-category", product)}
          renderContent={(data) => <BestInCategoryContent data={data} />}
        />
      </View>

      <GlassCard style={styles.adviceCard}>
        <View style={styles.adviceHeader}>
          <Ionicons name="bulb-outline" size={18} color={colors.accent} />
          <Text style={styles.adviceTitle}>Buying advice</Text>
        </View>
        <Text style={styles.body}>{report.buyingAdvice}</Text>
      </GlassCard>

      {report.sources.length > 0 && (
        <CollapsibleSection
          icon="link-outline"
          title="Sources"
          preview={`${report.sources.length} source${report.sources.length === 1 ? "" : "s"} used to build this report`}
        >
          {report.sources.map((s, i) => (
            <Tappable
              key={i}
              onPress={() => openRetailer(s.url)}
              style={[styles.sourceRow, i === 0 && styles.sourceRowFirst]}
            >
              <Favicon url={s.url} size={22} />
              <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                <Text style={styles.sourceTitle} numberOfLines={1}>
                  {s.title || s.url}
                </Text>
                <View style={styles.sourceMetaRow}>
                  <SourceTypeIcon type={s.type} size={11} />
                  <Text style={styles.sourceMeta}>{s.type}</Text>
                </View>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.textFaint} />
            </Tappable>
          ))}
        </CollapsibleSection>
      )}

      <Tappable onPress={onBack} style={styles.scanAgainWrap} accessibilityLabel="Scan another">
        <LinearGradient colors={ctaGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.scanAgain}>
          <Ionicons name="scan-outline" size={17} color={colors.onAccent} />
          <Text style={styles.scanAgainText}>Scan another</Text>
        </LinearGradient>
      </Tappable>
    </ScrollView>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <GlassCard style={styles.section}>
      <View style={styles.sectionHeader}>
        <VintageIcon name={icon} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </GlassCard>
  );
}

function Bullets({
  title,
  items,
  tint,
  icon,
  style,
}: {
  title: string;
  items: string[];
  tint: string;
  icon: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  if (!items.length) return null;
  return (
    <GlassCard style={[styles.section, style]}>
      <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>{title}</Text>
      {items.slice(0, 4).map((it, i) => (
        <View key={i} style={styles.bulletRow}>
          <Ionicons name={icon} size={15} color={tint} style={{ marginTop: 2 }} />
          <Text style={styles.body} numberOfLines={3}>
            {it}
          </Text>
        </View>
      ))}
    </GlassCard>
  );
}

/** Same bullet look as `Bullets`, but bare (no GlassCard) - used inside a CollapsibleSection body. */
function SubBullets({
  title,
  items,
  tint,
  icon,
}: {
  title: string;
  items: string[];
  tint: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  if (!items.length) return null;
  return (
    <View style={styles.subBulletGroup}>
      <Text style={styles.subBulletTitle}>{title}</Text>
      {items.slice(0, 4).map((it, i) => (
        <View key={i} style={styles.bulletRow}>
          <Ionicons name={icon} size={14} color={tint} style={{ marginTop: 2 }} />
          <Text style={styles.body} numberOfLines={3}>
            {it}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Collapsed by default: shows a one-line preview, expands in place on tap - keeps deep detail out of the way. */
function CollapsibleSection({
  icon,
  title,
  preview,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  preview: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  }

  return (
    <GlassCard style={styles.section}>
      <Tappable onPress={toggle} style={styles.collapsibleHeaderRow}>
        <View style={styles.sectionHeader}>
          <VintageIcon name={icon} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} />
      </Tappable>
      {!expanded && (
        <Text style={styles.collapsiblePreview} numberOfLines={2}>
          {preview}
        </Text>
      )}
      {expanded && <View style={styles.collapsibleBody}>{children}</View>}
    </GlassCard>
  );
}

/** Alternatives, capped to 2 with a "show more" toggle so the report doesn't front-load every option. */
function ExpandableAlternatives({
  alternatives,
  altBuy,
  onFindBuyLinks,
}: {
  alternatives: { name: string; why: string }[];
  altBuy: Record<number, AltBuyState>;
  onFindBuyLinks: (i: number, name: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? alternatives : alternatives.slice(0, 2);
  const remaining = alternatives.length - visible.length;

  return (
    <>
      {visible.map((a, i) => {
        const st = altBuy[i];
        return (
          <View key={i} style={styles.altRow}>
            <View style={styles.altDot} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.altName} numberOfLines={1}>
                {a.name}
              </Text>
              <Text style={styles.altWhy} numberOfLines={2}>
                {a.why}
              </Text>

              {!st && (
                <Tappable onPress={() => onFindBuyLinks(i, a.name)} style={styles.altFindBtn}>
                  <Ionicons name="search-outline" size={12} color={colors.accent} />
                  <Text style={styles.altFindText}>Find where to buy</Text>
                </Tappable>
              )}

              {st?.loading && (
                <View style={{ marginTop: space(2), height: space(8) }}>
                  <LoadingState label="Finding buy links…" />
                </View>
              )}

              {st?.links && st.links.length > 0 && (
                <View style={{ marginTop: 8, gap: 6 }}>
                  {sortByPrice(st.links).map((b, j) => (
                    <Tappable key={j} onPress={() => openRetailer(b.url)} style={styles.altBuyRow}>
                      <RetailerMark retailerId={b.retailerId} name={b.retailer} url={b.url} showName={false} size={16} />
                      <Text style={styles.altBuyText} numberOfLines={1}>
                        {b.retailer}
                      </Text>
                      <PriceText amount={buyAmount(b)} currency={b.currency ?? "INR"} style={styles.altBuyPrice} />
                      <Ionicons name="open-outline" size={12} color={colors.textFaint} />
                    </Tappable>
                  ))}
                </View>
              )}

              {st?.links && st.links.length === 0 && <Text style={styles.altBuyEmpty}>No buy links found</Text>}
              {st?.error && <Text style={styles.altBuyEmpty}>Couldn't look this up right now</Text>}
            </View>
          </View>
        );
      })}

      {remaining > 0 && (
        <Tappable onPress={() => setShowAll(true)} style={styles.altFindBtn}>
          <Ionicons name="chevron-down" size={13} color={colors.accent} />
          <Text style={styles.altFindText}>Show {remaining} more</Text>
        </Tappable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space(5), gap: 14 },

  header: { flexDirection: "row", alignItems: "center", gap: space(2.5) },
  iconBtn: {
    width: space(9),
    height: space(9),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  headerText: { flex: 1 },
  eyebrow: { ...font.label, color: colors.textFaint },
  product: { fontFamily: fonts.serif, color: colors.text, fontSize: 22, lineHeight: 28, marginTop: 1 },

  heroWrap: { gap: space(3) },
  gaugeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(4),
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space(4),
  },
  scoreLabel: { fontFamily: fonts.sansBold, color: colors.text, fontSize: 15, lineHeight: 20 },
  scoreHint: { fontFamily: fonts.sans, color: colors.textMuted, fontSize: 13, lineHeight: 18 },

  section: { gap: 8 },
  deepDiveSection: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 2, flexShrink: 1, minWidth: 0 },
  sectionTitle: { ...font.label, color: colors.textMuted },
  body: { fontFamily: fonts.sans, color: colors.text, fontSize: 14.5, lineHeight: 21 },
  compactBody: { fontSize: 13.5, lineHeight: 19, marginTop: 8 },

  collapsibleHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  collapsiblePreview: {
    fontFamily: fonts.sans,
    color: colors.textFaint,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  collapsibleBody: { marginTop: 10, gap: 12 },
  subBulletGroup: { gap: 2 },
  subBulletTitle: { fontFamily: fonts.sansBold, color: colors.textFaint, fontSize: 11.5, letterSpacing: 0.5, marginBottom: 2 },

  twoCol: { flexDirection: "row", gap: 12 },
  colHalf: { flex: 1 },

  bulletRow: { flexDirection: "row", gap: 8, marginTop: 2 },

  priceRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },

  altRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  altDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 7 },
  altName: { fontFamily: fonts.sansBold, color: colors.text, fontSize: 14.5 },
  altWhy: { fontFamily: fonts.sans, color: colors.textMuted, fontSize: 13, marginTop: 1, lineHeight: 18 },
  altFindBtn: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  altFindText: { fontFamily: fonts.sansBold, color: colors.accent, fontSize: 12.5 },
  altBuyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  altBuyText: { fontFamily: fonts.sansSemiBold, color: colors.text, fontSize: 12.5, flex: 1 },
  altBuyPrice: { fontFamily: fonts.monoBold, color: colors.accent, fontSize: 13.5 },
  altBuyEmpty: { fontFamily: fonts.sans, color: colors.textFaint, fontSize: 12, fontStyle: "italic", marginTop: 6 },

  adviceCard: { gap: space(2), borderColor: colors.accent },
  adviceHeader: { flexDirection: "row", alignItems: "center", gap: space(2) },
  adviceTitle: { ...font.label, color: colors.accent },

  buyCompareLine: {
    fontFamily: fonts.sansSemiBold,
    color: colors.textFaint,
    fontSize: 12,
    marginBottom: 2,
  },
  buyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space(2.5),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  buyRetailerRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  buyRetailer: { fontFamily: fonts.sansBold, color: colors.text, fontSize: 14, flexShrink: 1 },
  buyTitle: { fontFamily: fonts.sans, color: colors.textMuted, fontSize: 12, marginTop: 1 },
  buyPriceTag: {
    flexShrink: 0,
    backgroundColor: colors.accentSoft,
    paddingVertical: space(1.5),
    paddingHorizontal: space(3),
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  buyPriceTagBest: {
    backgroundColor: colors.buy,
    borderColor: colors.buy,
  },
  buyPrice: { fontFamily: fonts.monoBold, color: colors.accent, fontSize: 16 },
  buyPriceBest: { color: colors.onAccent },
  buyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1),
    backgroundColor: colors.accent,
    paddingVertical: space(1.5),
    paddingHorizontal: space(3),
    borderRadius: radius.pill,
  },
  buyCtaText: { fontFamily: fonts.sansBold, color: colors.onAccent, fontSize: 12 },

  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sourceRowFirst: { borderTopWidth: 0 },
  sourceTitle: { fontFamily: fonts.sansSemiBold, color: colors.text, fontSize: 13.5 },
  sourceMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  sourceMeta: { fontFamily: fonts.sansSemiBold, color: colors.textFaint, fontSize: 11, textTransform: "capitalize" },

  scanAgainWrap: { borderRadius: radius.md, overflow: "hidden", marginTop: 6 },
  scanAgain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: radius.md,
  },
  scanAgainText: { fontFamily: fonts.sansBold, color: colors.onAccent, fontSize: 15.5 },
});
