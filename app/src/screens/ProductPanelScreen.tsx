import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MotiView } from "moti";
import { Tappable } from "../components/Tappable";
import { VerdictTicket } from "../components/VerdictTicket";
import { CompareDealsSection } from "../components/CompareDealsSection";
import {
  Card,
  ErrorBanner,
  LoadingState,
  PillButton,
  PrimaryButton,
  SheetHeader,
  TabBar,
} from "../components/ui";
import { identifyScreen, research, compareEverywhere, type CompareIds } from "../api/client";
import { getCurrentScreenText } from "verdict-accessibility";
import { getCountry, type Country } from "../country";
import { openRetailer } from "../deeplink";
import { track } from "../analytics/posthog";
import { PriceText } from "../components/PriceText";
import { RetailerMark } from "../components/RetailerMark";
import { filterOffersByCurrency, filterPricedOffers, groupOffersByKind, labelForPackage, sortOffersForDeals } from "../retailers";
import { colors, font, fonts, motion, radius, space } from "../theme";
import type {
  BuyLink,
  ConsensusReport,
  MarketplaceOffer,
  ProductIdentity,
  ReferencePrice,
} from "../types";

type Tab = "report" | "deal" | "discount";

function DecorativeHandle() {
  return (
    <View style={styles.handleHitArea} pointerEvents="none">
      <View style={styles.handle} />
    </View>
  );
}

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
  const [tab, setTab] = useState<Tab>("deal");
  const [stage, setStage] = useState<"identifying" | "researching" | "ready" | "error">("identifying");
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductIdentity | null>(null);
  const [referencePrice, setReferencePrice] = useState<ReferencePrice | null>(null);
  const [productIds, setProductIds] = useState<CompareIds | null>(null);
  const [report, setReport] = useState<ConsensusReport | null>(null);
  const [buyLinks, setBuyLinks] = useState<BuyLink[]>([]);
  const [productId, setProductId] = useState<string | null>(null);
  const [offers, setOffers] = useState<MarketplaceOffer[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [country, setCountryState] = useState<Country>("IN");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    getCountry().then(setCountryState).catch(() => {});
  }, []);

  const label = useMemo(() => labelForPackage(packageName, country), [packageName, country]);
  const currency = country === "US" ? "USD" : "INR";
  // Hide (never relabel) any offer whose currency doesn't match the user's
  // own country - see filterOffersByCurrency for why.
  const currencyOffers = useMemo(
    () => sortOffersForDeals(filterPricedOffers(filterOffersByCurrency(offers, currency))),
    [offers, currency]
  );
  const grouped = useMemo(() => groupOffersByKind(currencyOffers, country), [currencyOffers, country]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setStage("identifying");
      setError(null);
      try {
        // Native opens this sheet instantly on tap, before doing any
        // accessibility capture (see VerdictOverlayService.openProductPanel) -
        // so text/packageName usually arrive empty here. Capture now instead,
        // while this loading state is already visible, rather than the sheet
        // itself waiting to appear until native capture finished.
        let scanText = text;
        let scanPackage = packageName;
        if (!scanText) {
          const fresh = getCurrentScreenText();
          scanText = fresh.text ?? "";
          scanPackage = fresh.packageName ?? packageName;
        }
        const { product: p, referencePrice: ref, asin, fsn, flipkartItemId } = await identifyScreen(
          scanText,
          scanPackage
        );
        if (!alive) return;
        setProduct(p);
        // The price already on this screen - authoritative baseline passed to
        // compare/deals so a same-platform re-scrape can never be shown as a
        // "better deal" than what the user is looking at right now.
        setReferencePrice(ref);
        setProductIds({ asin, fsn, flipkartItemId });
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
  }, [text, packageName, retryKey]);

  useEffect(() => {
    if (!product || (stage !== "ready" && stage !== "researching")) return;
    if (tab !== "discount") return;
    let alive = true;
    setDealsLoading(true);
    (async () => {
      try {
        const cmp = await compareEverywhere(product, productIds, referencePrice);
        if (!alive) return;
        setOffers(cmp?.offers ?? []);
        track("deals_viewed", { category: product.category, offerCount: cmp?.offers?.length ?? 0 });
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
    <View style={styles.root}>
      <MotiView
        from={{ translateY: 24, opacity: 0.92 }}
        animate={{ translateY: 0, opacity: 1 }}
        transition={{ type: "timing", duration: motion.fast }}
        style={styles.sheet}
      >
        <DecorativeHandle />

        <SheetHeader
          eyebrow={`Over ${label}`}
          title={product?.name ?? "Researching…"}
          onClose={onClose}
        />

        <TabBar<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "deal", label: "Deal", icon: "trophy-outline" },
            { id: "discount", label: "Discount", icon: "pricetag-outline" },
            { id: "report", label: "Report", icon: "document-text-outline" },
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
            {(stage === "identifying" || (stage === "researching" && tab === "report")) && (
              <LoadingState
                label={stage === "identifying" ? "Identifying product…" : "Building consensus…"}
              />
            )}

            {stage === "error" && (
              <View style={styles.center}>
                <ErrorBanner
                  message={
                    error?.includes("product_identity") || error?.toLowerCase().includes("product name")
                      ? "Couldn’t read the product name"
                      : error ?? "Something went wrong"
                  }
                />
                <PrimaryButton
                  label="Try again"
                  onPress={() => {
                    setError(null);
                    setProduct(null);
                    setRetryKey((k) => k + 1);
                  }}
                />
                <SecondaryClose onPress={onClose} />
              </View>
            )}

            {stage === "ready" && report && product && tab === "report" && (
              <View style={{ gap: space(3.5) }}>
                <VerdictTicket
                  verdict={report.verdict}
                  productTitle={product.name}
                  headline={report.verdictLine}
                  sourceCount={report.sources?.length}
                  compact
                />

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
                        <RetailerMark retailerId={l.retailerId} name={l.retailer} url={l.url} />
                        <PriceText amount={l.amount} currency={l.currency ?? currency} />
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

            {product && tab === "deal" && stage !== "error" && stage !== "identifying" && (
              <View style={{ gap: space(3) }}>
                <CompareDealsSection product={product} referencePrice={referencePrice} productIds={productIds} />
              </View>
            )}

            {product && tab === "discount" && stage !== "error" && stage !== "identifying" && (
              <View style={{ gap: space(3) }}>
                {dealsLoading && <LoadingState label="Fetching offers…" />}
                {!dealsLoading && (
                  <>
                    <OfferGroup
                      title="Marketplaces"
                      offers={grouped.marketplaces}
                      productName={product.name}
                      currency={currency}
                    />
                    <OfferGroup
                      title="Quick commerce"
                      offers={grouped.quickCommerce}
                      productName={product.name}
                      currency={currency}
                    />
                    {!currencyOffers.length && (
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
  return <PillButton label="Close" onPress={onPress} active={false} />;
}

function OfferGroup({
  title,
  offers,
  productName,
  currency,
}: {
  title: string;
  offers: MarketplaceOffer[];
  productName: string;
  currency: string;
}) {
  if (!offers.length) return null;
  return (
    <View style={{ gap: space(2.5) }}>
      <Text style={styles.groupTitle}>{title}</Text>
      {offers.slice(0, 8).map((o, i) => {
        const oos = o.inStock === false;
        return (
          <Tappable
            key={`${o.url}-${i}`}
            onPress={() => {
              if (!o.url) return;
              track("marketplace_deeplink_opened", { platform: o.retailerId, manual: false });
              openRetailer(o.url, o.retailerId).catch(() => {});
            }}
            style={[styles.offerRow, oos && { opacity: 0.85 }]}
            accessibilityLabel={`${o.retailer} ${oos ? "out of stock" : "price"}`}
          >
            <RetailerMark retailerId={o.retailerId} name={o.retailer} url={o.url} showName={false} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.offerMarket}>{o.retailer}</Text>
              <Text style={styles.offerTitle} numberOfLines={2}>
                {o.title ?? productName}
              </Text>
              {oos && <Text style={styles.oosLabel}>Out of stock</Text>}
              {!oos && o.coupons?.length > 0 && (
                <Text style={styles.muted} numberOfLines={1}>
                  {o.coupons.slice(0, 2).join(" · ")}
                </Text>
              )}
            </View>
            <PriceText amount={o.price} currency={currency} style={styles.offerPrice} />
          </Tappable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // This screen is hosted as its own overlay-window surface, sized by native
  // code to exactly the sheet's footprint (see VerdictOverlayService.showPanel)
  // - there's no backdrop/scrim here because everything outside this window
  // IS the shopping app underneath, which must stay live and touchable.
  root: { flex: 1, backgroundColor: colors.bg },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingBottom: space(4.5),
    overflow: "hidden",
  },
  handleHitArea: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingTop: space(2.5),
    paddingBottom: space(2.5),
  },
  handle: {
    width: space(10.5),
    height: space(1),
    borderRadius: radius.pill,
    backgroundColor: colors.ticketPerforation,
  },
  handleActive: {
    width: space(14),
    backgroundColor: colors.accent,
  },
  // flex:1 (not a fixed maxHeight) - the sheet's native window height is
  // dynamic (default + user-draggable via ResizeHandle, see
  // VerdictOverlayService.applyPanelHeight), so this must consume whatever's
  // left after the handle/header/tabs rather than a hardcoded guess that
  // clips content when the window is shorter.
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: space(4), paddingBottom: space(6), gap: space(3) },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: space(10), gap: space(3) },
  cardTitle: { ...font.monoSm, color: colors.accent, textTransform: "uppercase" },
  bullet: { ...font.small, fontFamily: fonts.sans, color: colors.textMuted },
  bodyText: { ...font.small, fontFamily: fonts.sans, color: colors.textMuted, lineHeight: 19 },
  buyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space(1.5),
  },
  buyLabel: { ...font.bodyMedium, fontFamily: fonts.sansMedium, color: colors.text, flex: 1, marginRight: space(2) },
  buyPrice: { ...font.monoSm, fontFamily: fonts.mono, color: colors.accent },
  muted: { ...font.small, fontFamily: fonts.sans, color: colors.textFaint },
  groupTitle: { ...font.monoSm, color: colors.accent, textTransform: "uppercase" },
  offerRow: {
    flexDirection: "row",
    gap: space(2.5),
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space(3),
  },
  offerMarket: { ...font.monoSm, color: colors.accent },
  offerTitle: { ...font.small, fontFamily: fonts.sans, color: colors.text },
  offerPrice: { ...font.monoSm, fontFamily: fonts.mono, color: colors.text },
  oosLabel: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.avoid, marginTop: 2 },
});
