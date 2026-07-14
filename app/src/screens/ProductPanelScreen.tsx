import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MotiView } from "moti";
import { Tappable } from "../components/Tappable";
import { ScoreGauge } from "../components/ScoreGauge";
import { Badge } from "../components/Badge";
import { CompareDealsSection } from "../components/CompareDealsSection";
import { Card, ErrorBanner, LoadingState, PillButton, PrimaryButton, SheetHeader, TabBar } from "../components/ui";
import { identifyScreen, research, compareEverywhere } from "../api/client";
import { getCountry, type Country } from "../country";
import { openRetailer } from "../deeplink";
import { track } from "../analytics/posthog";
import { formatMoney } from "../format";
import { groupOffersByKind, labelForPackage } from "../retailers";
import { colors, fonts, motion, radius, space, verdictColor, verdictLabel } from "../theme";
import type {
  BuyLink,
  ConsensusReport,
  MarketplaceOffer,
  ProductIdentity,
  ReferencePrice,
} from "../types";

type Tab = "report" | "deal" | "discount";

type Props = {
  text: string;
  packageName: string;
  onClose: () => void;
  onOpenFullReport?: (
    report: ConsensusReport,
    product: ProductIdentity,
    buyLinks: BuyLink[],
    productId: string | null
  ) => void;
};

export function ProductPanelScreen({ text, packageName, onClose, onOpenFullReport }: Props) {
  const [tab, setTab] = useState<Tab>("report");
  const [stage, setStage] = useState<"identifying" | "researching" | "ready" | "error">("identifying");
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductIdentity | null>(null);
  const [referencePrice, setReferencePrice] = useState<ReferencePrice | null>(null);
  const [report, setReport] = useState<ConsensusReport | null>(null);
  const [buyLinks, setBuyLinks] = useState<BuyLink[]>([]);
  const [productId, setProductId] = useState<string | null>(null);
  const [offers, setOffers] = useState<MarketplaceOffer[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [country, setCountryState] = useState<Country>("IN");

  useEffect(() => {
    getCountry().then(setCountryState).catch(() => {});
  }, []);

  const label = useMemo(() => labelForPackage(packageName, country), [packageName, country]);
  const grouped = useMemo(() => groupOffersByKind(offers, country), [offers, country]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setStage("identifying");
      setError(null);
      try {
        const { product: p, referencePrice: ref } = await identifyScreen(text, packageName);
        if (!alive) return;
        setProduct(p);
        // The price already on this screen - authoritative baseline passed to
        // compare/deals so a same-platform re-scrape can never be shown as a
        // "better deal" than what the user is looking at right now.
        setReferencePrice(ref);
        setStage("researching");
        const res = await research(p);
        if (!alive) return;
        setReport(res.report);
        setBuyLinks(res.buyLinks ?? []);
        setProductId(res.productId);
        setStage("ready");
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message);
        setStage("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [text, packageName]);

  useEffect(() => {
    if (stage !== "ready" || !product) return;
    if (tab !== "discount" && tab !== "deal") return;
    let alive = true;
    setDealsLoading(true);
    (async () => {
      try {
        const cmp = await compareEverywhere(product, null, referencePrice);
        if (!alive) return;
        setOffers(cmp?.offers ?? []);
        // "deal" tab renders its own CompareDealsSection (tracks compare_viewed itself);
        // this fetch only feeds the visible offer list for the "discount" tab.
        if (tab === "discount") {
          track("deals_viewed", { category: product.category, offerCount: cmp?.offers?.length ?? 0 });
        }
      } catch {
        if (alive) setOffers([]);
      } finally {
        if (alive) setDealsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tab, stage, product?.name, product?.searchTerm]);

  return (
    <View style={styles.root} pointerEvents="box-none">
      <MotiView
        from={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: "timing", duration: motion.normal }}
        style={StyleSheet.absoluteFill}
      >
        <Tappable onPress={onClose} style={styles.scrim}>
          <View />
        </Tappable>
      </MotiView>

      <MotiView
        from={{ translateY: 420, opacity: 0.85 }}
        animate={{ translateY: 0, opacity: 1 }}
        transition={{ type: "spring", ...motion.spring }}
        style={styles.sheet}
      >
        <View style={styles.handle} />

        <SheetHeader
          eyebrow={`Over ${label}`}
          title={product?.name ?? "Researching…"}
          onClose={onClose}
        />

        <TabBar<Tab | "chat">
          value={tab}
          onChange={(id) => {
            if (id !== "chat") setTab(id);
          }}
          tabs={[
            { id: "report", label: "Report", icon: "document-text-outline" },
            { id: "deal", label: "Deal", icon: "trophy-outline" },
            { id: "discount", label: "Discount", icon: "pricetag-outline" },
            { id: "chat", label: "Chat", icon: "chatbubble-outline", disabled: true },
          ]}
        />

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          <MotiView
            key={tab}
            from={{ opacity: 0, translateX: 10 }}
            animate={{ opacity: 1, translateX: 0 }}
            transition={{ type: "timing", duration: motion.fast }}
          >
            {(stage === "identifying" || stage === "researching") && (
              <LoadingState
                label={stage === "identifying" ? "Identifying product…" : "Building consensus…"}
              />
            )}

            {stage === "error" && (
              <View style={styles.center}>
                <ErrorBanner message={error ?? "Something went wrong"} />
                <SecondaryClose onPress={onClose} />
              </View>
            )}

            {stage === "ready" && report && product && tab === "report" && (
              <View style={{ gap: space(3.5) }}>
                <View style={styles.verdictRow}>
                  <View style={{ flex: 1, gap: space(1.5) }}>
                    <Badge
                      label={verdictLabel[report.verdict]}
                      color={verdictColor[report.verdict]}
                    />
                    <Text style={styles.verdictLine} numberOfLines={4}>
                      {report.verdictLine}
                    </Text>
                  </View>
                  <ScoreGauge score={report.score} color={verdictColor[report.verdict]} />
                </View>

                {report.pros?.length > 0 && (
                  <Card>
                    <Text style={styles.cardTitle}>Pros</Text>
                    {report.pros.slice(0, 3).map((p, i) => (
                      <Text key={i} style={styles.bullet} numberOfLines={2}>
                        · {p}
                      </Text>
                    ))}
                  </Card>
                )}

                {report.complaints?.length > 0 && (
                  <Card>
                    <Text style={styles.cardTitle}>Complaints</Text>
                    {report.complaints.slice(0, 3).map((p, i) => (
                      <Text key={i} style={styles.bullet} numberOfLines={2}>
                        · {p}
                      </Text>
                    ))}
                  </Card>
                )}

                {report.buyingAdvice ? (
                  <Card>
                    <Text style={styles.cardTitle}>Advice</Text>
                    <Text style={styles.bodyText} numberOfLines={5}>
                      {report.buyingAdvice}
                    </Text>
                  </Card>
                ) : null}

                {buyLinks.length > 0 && (
                  <Card>
                    <Text style={styles.cardTitle}>Buy</Text>
                    {buyLinks.slice(0, 4).map((l, i) => (
                      <Tappable
                        key={i}
                        onPress={() => openRetailer(l.url).catch(() => {})}
                        style={styles.buyRow}
                      >
                        <Text style={styles.buyLabel} numberOfLines={1}>
                          {l.retailer ?? "Shop"}
                        </Text>
                        <Text style={styles.buyPrice}>{l.price ?? "Open"}</Text>
                      </Tappable>
                    ))}
                  </Card>
                )}

                {onOpenFullReport && (
                  <PrimaryButton
                    label="Open full report"
                    onPress={() => onOpenFullReport(report, product, buyLinks, productId)}
                  />
                )}
              </View>
            )}

            {stage === "ready" && product && tab === "deal" && (
              <View style={{ gap: space(3) }}>
                <CompareDealsSection product={product} referencePrice={referencePrice} />
              </View>
            )}

            {stage === "ready" && product && tab === "discount" && (
              <View style={{ gap: space(3) }}>
                {dealsLoading && <ActivityIndicator color={colors.accent} />}
                {!dealsLoading && (
                  <>
                    <OfferGroup
                      title="Marketplaces"
                      offers={grouped.marketplaces}
                      productName={product.name}
                    />
                    <OfferGroup
                      title="Quick commerce"
                      offers={grouped.quickCommerce}
                      productName={product.name}
                    />
                    {!offers.length && (
                      <Text style={styles.muted}>No marketplace offers found yet.</Text>
                    )}
                  </>
                )}
              </View>
            )}
          </MotiView>
        </ScrollView>
      </MotiView>
    </View>
  );
}

function SecondaryClose({ onPress }: { onPress: () => void }) {
  return (
    <PillButton label="Close" onPress={onPress} active={false} />
  );
}

function OfferGroup({
  title,
  offers,
  productName,
}: {
  title: string;
  offers: MarketplaceOffer[];
  productName: string;
}) {
  if (!offers.length) return null;
  return (
    <View style={{ gap: space(2.5) }}>
      <Text style={styles.groupTitle}>{title}</Text>
      {offers.slice(0, 8).map((o, i) => (
        <Tappable
          key={`${o.url}-${i}`}
          onPress={() => {
            if (!o.url) return;
            track("marketplace_deeplink_opened", { platform: o.retailerId, manual: Boolean(o.checkManually) });
            openRetailer(o.url, o.retailerId).catch(() => {});
          }}
          style={styles.offerRow}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.offerMarket}>{o.retailer}</Text>
            <Text style={styles.offerTitle} numberOfLines={2}>
              {o.checkManually ? "Live price not available" : o.title ?? productName}
            </Text>
            {!o.checkManually && o.coupons?.length > 0 && (
              <Text style={styles.muted} numberOfLines={1}>
                {o.coupons.slice(0, 2).join(" · ")}
              </Text>
            )}
          </View>
          {o.checkManually ? (
            <View style={styles.manualRow}>
              <Ionicons name="open-outline" size={13} color={colors.textMuted} />
              <Text style={styles.manualText}>Check manually</Text>
            </View>
          ) : (
            <Text style={styles.offerPrice}>
              {o.price != null ? formatMoney(o.price, o.currency) : o.priceRaw ?? "—"}
            </Text>
          )}
        </Tappable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: "#111110",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingBottom: space(4.5),
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,215,109,0.35)",
    marginTop: space(2.5),
    marginBottom: space(2),
  },
  body: { maxHeight: 520 },
  bodyContent: { paddingHorizontal: space(4), paddingBottom: space(6), gap: space(3) },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: space(10), gap: space(3) },
  loadingText: { fontFamily: fonts.sans, color: colors.textMuted, fontSize: 13 },
  errorText: {
    fontFamily: fonts.sans,
    color: colors.avoid,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: space(5),
  },
  verdictRow: { flexDirection: "row", gap: space(3), alignItems: "center" },
  verdictLine: {
    fontFamily: fonts.sansSemiBold,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  cardTitle: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  bullet: { fontFamily: fonts.sans, color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  bodyText: { fontFamily: fonts.sans, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  buyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space(1.5),
  },
  buyLabel: { fontFamily: fonts.sansMedium, color: colors.text, flex: 1, marginRight: space(2) },
  buyPrice: { fontFamily: fonts.mono, color: colors.accent, fontSize: 12 },
  muted: { fontFamily: fonts.sans, color: colors.textFaint, fontSize: 13 },
  groupTitle: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  offerRow: {
    flexDirection: "row",
    gap: space(2.5),
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: space(3),
  },
  offerMarket: { fontFamily: fonts.mono, fontSize: 10, color: colors.accent },
  offerTitle: { fontFamily: fonts.sans, color: colors.text, fontSize: 13 },
  offerPrice: { fontFamily: fonts.mono, color: colors.text, fontSize: 13 },
  manualRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  manualText: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.textMuted },
});
