import { useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
import { identifyScreen, research, compareEverywhere } from "../api/client";
import { getCurrentScreenText } from "verdict-accessibility";
import {
  PANEL_DEFAULT_HEIGHT_FRACTION,
  PANEL_MAX_HEIGHT_FRACTION,
  PANEL_MIN_HEIGHT_FRACTION,
  resizePanel,
  snapPanel,
} from "verdict-overlay";
import { getCountry, type Country } from "../country";
import { openRetailer } from "../deeplink";
import { track } from "../analytics/posthog";
import { formatMoney } from "../format";
import { filterOffersByCurrency, groupOffersByKind, labelForPackage, retailerLogoUrl } from "../retailers";
import { Favicon } from "../components/Icons";
import { colors, font, fonts, iconSize, motion, radius, space } from "../theme";
import type {
  BuyLink,
  ConsensusReport,
  MarketplaceOffer,
  ProductIdentity,
  ReferencePrice,
} from "../types";

type Tab = "report" | "deal" | "discount";

/**
 * Drags the actual native overlay window's height (see
 * VerdictOverlayService.applyPanelHeight) - this sheet isn't a normal RN
 * modal, it's a real Android window, so resizing it means telling native to
 * resize that window, not just restyling a View. Snap points: 32% / 56% / 88%.
 */
const SNAP_POINTS: number[] = [0.32, 0.56, 0.88];

function nearestSnap(fraction: number, velocityDy: number, screenH: number): number {
  // Project a short distance from release velocity (px/ms -> fraction).
  const projected = fraction + (-velocityDy * 0.18) / screenH;
  let best = SNAP_POINTS[0];
  let bestDist = Math.abs(projected - best);
  for (const p of SNAP_POINTS) {
    const d = Math.abs(projected - p);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return Math.min(PANEL_MAX_HEIGHT_FRACTION, Math.max(PANEL_MIN_HEIGHT_FRACTION, best));
}

function ResizeHandle() {
  const { height: screenHeight } = useWindowDimensions();
  const [dragging, setDragging] = useState(false);
  const fractionRef = useRef(PANEL_DEFAULT_HEIGHT_FRACTION);
  const startFractionRef = useRef(PANEL_DEFAULT_HEIGHT_FRACTION);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startFractionRef.current = fractionRef.current;
        setDragging(true);
      },
      onPanResponderMove: (_evt, gesture) => {
        // Full screen height basis (matches native fraction math).
        const delta = -gesture.dy / screenHeight;
        const next = Math.min(
          PANEL_MAX_HEIGHT_FRACTION,
          Math.max(PANEL_MIN_HEIGHT_FRACTION, startFractionRef.current + delta)
        );
        fractionRef.current = next;
        resizePanel(next);
      },
      onPanResponderRelease: (_evt, gesture) => {
        setDragging(false);
        const snapped = nearestSnap(fractionRef.current, gesture.vy, screenHeight);
        fractionRef.current = snapped;
        snapPanel(snapped);
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        const snapped = nearestSnap(fractionRef.current, 0, screenHeight);
        fractionRef.current = snapped;
        snapPanel(snapped);
      },
    })
  ).current;

  return (
    <View {...panResponder.panHandlers} style={styles.handleHitArea}>
      <View style={[styles.handle, dragging && styles.handleActive]} />
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
  const currency = country === "US" ? "USD" : "INR";
  // Hide (never relabel) any offer whose currency doesn't match the user's
  // own country - see filterOffersByCurrency for why.
  const currencyOffers = useMemo(() => filterOffersByCurrency(offers, currency), [offers, currency]);
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
        const { product: p, referencePrice: ref } = await identifyScreen(scanText, scanPackage);
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
    <View style={styles.root}>
      <MotiView
        from={{ translateY: 24, opacity: 0.92 }}
        animate={{ translateY: 0, opacity: 1 }}
        transition={{ type: "timing", duration: motion.fast }}
        style={styles.sheet}
      >
        <ResizeHandle />

        <SheetHeader
          eyebrow={`Over ${label}`}
          title={product?.name ?? "Researching…"}
          onClose={onClose}
        />

        <TabBar<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "report", label: "Report", icon: "document-text-outline" },
            { id: "deal", label: "Deal", icon: "trophy-outline" },
            { id: "discount", label: "Discount", icon: "pricetag-outline" },
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
      {offers.slice(0, 8).map((o, i) => (
        <Tappable
          key={`${o.url}-${i}`}
          onPress={() => {
            if (!o.url) return;
            track("marketplace_deeplink_opened", { platform: o.retailerId, manual: Boolean(o.checkManually) });
            openRetailer(o.url, o.retailerId).catch(() => {});
          }}
          style={styles.offerRow}
          accessibilityLabel={`${o.retailer} price`}
        >
          <Favicon url={retailerLogoUrl(o.retailerId, o.url)} size={20} />
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
              <Ionicons name="open-outline" size={iconSize.sm} color={colors.textMuted} />
              <Text style={styles.manualText}>Check manually</Text>
            </View>
          ) : (
            <Text style={styles.offerPrice}>
              {o.price != null ? formatMoney(o.price, currency) : o.priceRaw ?? "-"}
            </Text>
          )}
        </Tappable>
      ))}
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
  manualRow: { flexDirection: "row", alignItems: "center", gap: space(1) },
  manualText: { ...font.caption, fontFamily: fonts.sansSemiBold, color: colors.textMuted },
});
