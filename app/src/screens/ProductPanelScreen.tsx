import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "../components/Tappable";
import { ScoreGauge } from "../components/ScoreGauge";
import { Badge } from "../components/Badge";
import { CompareDealsSection } from "../components/CompareDealsSection";
import { identifyScreen, research, compareEverywhere } from "../api/client";
import {
  colors,
  fonts,
  radius,
  verdictColor,
  verdictLabel,
} from "../theme";
import type {
  BuyLink,
  ConsensusReport,
  MarketplaceOffer,
  ProductIdentity,
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

function appLabel(pkg: string): string {
  if (pkg.includes("amazon")) return "Amazon";
  if (pkg.includes("flipkart")) return "Flipkart";
  if (pkg.includes("myntra")) return "Myntra";
  if (pkg.includes("ajio")) return "Ajio";
  if (pkg.includes("meesho")) return "Meesho";
  if (pkg.includes("nykaa")) return "Nykaa";
  return "shopping";
}

function formatInr(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function ProductPanelScreen({ text, packageName, onClose, onOpenFullReport }: Props) {
  const [tab, setTab] = useState<Tab>("report");
  const [stage, setStage] = useState<"identifying" | "researching" | "ready" | "error">("identifying");
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductIdentity | null>(null);
  const [report, setReport] = useState<ConsensusReport | null>(null);
  const [buyLinks, setBuyLinks] = useState<BuyLink[]>([]);
  const [productId, setProductId] = useState<string | null>(null);
  const [offers, setOffers] = useState<MarketplaceOffer[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);

  const label = useMemo(() => appLabel(packageName), [packageName]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setStage("identifying");
      setError(null);
      try {
        const p = await identifyScreen(text, packageName);
        if (!alive) return;
        setProduct(p);
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
    if (tab !== "discount") return;
    let alive = true;
    setDealsLoading(true);
    (async () => {
      try {
        const cmp = await compareEverywhere(product);
        if (!alive) return;
        setOffers(cmp?.offers ?? []);
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
      <Tappable onPress={onClose} style={styles.scrim}>
        <View />
      </Tappable>

      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Over {label}</Text>
            <Text style={styles.title} numberOfLines={1}>
              {product?.name ?? "Researching…"}
            </Text>
          </View>
          <Tappable onPress={onClose} style={styles.backBtn}>
            <Ionicons name="arrow-down" size={16} color={colors.onAccent} />
            <Text style={styles.backText}>Back</Text>
          </Tappable>
        </View>

        <View style={styles.tabs}>
          {(
            [
              { id: "report", label: "Report", icon: "document-text-outline" },
              { id: "deal", label: "Deal", icon: "trophy-outline" },
              { id: "discount", label: "Discount", icon: "pricetag-outline" },
            ] as const
          ).map((t) => {
            const active = tab === t.id;
            return (
              <Tappable
                key={t.id}
                onPress={() => setTab(t.id)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Ionicons
                  name={t.icon as any}
                  size={14}
                  color={active ? colors.onAccent : colors.textMuted}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Tappable>
            );
          })}
          <View style={[styles.tab, styles.tabDisabled]}>
            <Ionicons name="chatbubble-outline" size={14} color={colors.textFaint} />
            <Text style={[styles.tabText, { color: colors.textFaint }]}>Chat</Text>
          </View>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {(stage === "identifying" || stage === "researching") && (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.loadingText}>
                {stage === "identifying" ? "Identifying product…" : "Building consensus…"}
              </Text>
            </View>
          )}

          {stage === "error" && (
            <View style={styles.center}>
              <Ionicons name="alert-circle-outline" size={28} color={colors.avoid} />
              <Text style={styles.errorText}>{error ?? "Something went wrong"}</Text>
              <Tappable onPress={onClose} style={styles.retryBtn}>
                <Text style={styles.retryText}>Close</Text>
              </Tappable>
            </View>
          )}

          {stage === "ready" && report && product && tab === "report" && (
            <View style={{ gap: 14 }}>
              <View style={styles.verdictRow}>
                <View style={{ flex: 1, gap: 6 }}>
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
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Pros</Text>
                  {report.pros.slice(0, 3).map((p, i) => (
                    <Text key={i} style={styles.bullet} numberOfLines={2}>
                      · {p}
                    </Text>
                  ))}
                </View>
              )}

              {report.complaints?.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Complaints</Text>
                  {report.complaints.slice(0, 3).map((p, i) => (
                    <Text key={i} style={styles.bullet} numberOfLines={2}>
                      · {p}
                    </Text>
                  ))}
                </View>
              )}

              {report.buyingAdvice ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Advice</Text>
                  <Text style={styles.bodyText} numberOfLines={5}>
                    {report.buyingAdvice}
                  </Text>
                </View>
              ) : null}

              {buyLinks.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Buy</Text>
                  {buyLinks.slice(0, 4).map((l, i) => (
                    <Tappable
                      key={i}
                      onPress={() => Linking.openURL(l.url).catch(() => {})}
                      style={styles.buyRow}
                    >
                      <Text style={styles.buyLabel} numberOfLines={1}>
                        {l.retailer ?? "Shop"}
                      </Text>
                      <Text style={styles.buyPrice}>{l.price ?? "Open"}</Text>
                    </Tappable>
                  ))}
                </View>
              )}

              {onOpenFullReport && (
                <Tappable
                  onPress={() => onOpenFullReport(report, product, buyLinks, productId)}
                  style={styles.fullBtn}
                >
                  <Text style={styles.fullBtnText}>Open full report</Text>
                  <Ionicons name="open-outline" size={16} color={colors.onAccent} />
                </Tappable>
              )}
            </View>
          )}

          {stage === "ready" && product && tab === "deal" && (
            <View style={{ gap: 12 }}>
              <CompareDealsSection product={product} />
            </View>
          )}

          {stage === "ready" && product && tab === "discount" && (
            <View style={{ gap: 10 }}>
              {dealsLoading && <ActivityIndicator color={colors.accent} />}
              {!dealsLoading &&
                offers.slice(0, 8).map((o, i) => (
                  <Tappable
                    key={`${o.url}-${i}`}
                    onPress={() => o.url && Linking.openURL(o.url).catch(() => {})}
                    style={styles.offerRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.offerMarket}>{o.retailer}</Text>
                      <Text style={styles.offerTitle} numberOfLines={2}>
                        {o.title ?? product.name}
                      </Text>
                      {o.coupons?.length > 0 && (
                        <Text style={styles.muted} numberOfLines={1}>
                          {o.coupons.slice(0, 2).join(" · ")}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.offerPrice}>
                      {o.price != null ? formatInr(o.price) : o.priceRaw ?? "—"}
                    </Text>
                  </Tappable>
                ))}
              {!dealsLoading && !offers.length && (
                <Text style={styles.muted}>No marketplace offers found yet.</Text>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: "#111110",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingBottom: 18,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,215,109,0.35)",
    marginTop: 10,
    marginBottom: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.text,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  backText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    color: colors.onAccent,
  },
  tabs: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  tabActive: { backgroundColor: colors.accent },
  tabDisabled: { opacity: 0.45 },
  tabText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.textMuted,
  },
  tabTextActive: { color: colors.onAccent },
  body: { maxHeight: 520 },
  bodyContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 12 },
  loadingText: { fontFamily: fonts.sans, color: colors.textMuted, fontSize: 13 },
  errorText: {
    fontFamily: fonts.sans,
    color: colors.avoid,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  retryBtn: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  retryText: { fontFamily: fonts.sansSemiBold, color: colors.accent },
  verdictRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  verdictLine: {
    fontFamily: fonts.sansSemiBold,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 12,
    gap: 6,
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
    paddingVertical: 6,
  },
  buyLabel: { fontFamily: fonts.sansMedium, color: colors.text, flex: 1, marginRight: 8 },
  buyPrice: { fontFamily: fonts.mono, color: colors.accent, fontSize: 12 },
  fullBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 12,
    marginTop: 4,
  },
  fullBtnText: { fontFamily: fonts.sansSemiBold, color: colors.onAccent, fontSize: 13 },
  dealPrice: { fontFamily: fonts.serif, fontSize: 28, color: colors.accent },
  muted: { fontFamily: fonts.sans, color: colors.textFaint, fontSize: 13 },
  offerRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 12,
  },
  offerMarket: { fontFamily: fonts.mono, fontSize: 10, color: colors.accent },
  offerTitle: { fontFamily: fonts.sans, color: colors.text, fontSize: 13 },
  offerPrice: { fontFamily: fonts.mono, color: colors.text, fontSize: 13 },
});
