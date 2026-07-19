import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "./Tappable";
import { Badge } from "./Badge";
import { Card, EmptyState, LoadingState } from "./ui";
import { LocationBanner } from "./LocationBanner";
import { colors, fonts, radius, space } from "../theme";
import { fetchDeals, pollCompareJob, startCompareJob } from "../api/client";
import { getCountry, type Country } from "../country";
import { openRetailer } from "../deeplink";
import { track } from "../analytics/posthog";
import { formatMoney } from "../format";
import { filterOffersByCurrency, groupOffersByKind, retailerLogoUrl } from "../retailers";
import { Favicon } from "./Icons";
import type { MarketplaceOffer, ProductIdentity, RankedDeal, ReferencePrice } from "../types";

export function CompareDealsSection({
  product,
  preloaded,
  referencePrice,
}: {
  product: ProductIdentity;
  /** Skip the internal compare/deals fetch when the caller already has results
   *  (e.g. Direct Search, which gets both from a single /search call). */
  preloaded?: { offers: MarketplaceOffer[]; deals: RankedDeal[] };
  /** The live price already on the user's screen for this product, when known
   *  (e.g. from the overlay's screen-text identify). Passed through to
   *  /compare and /deals so a same-platform re-scrape can never be shown as a
   *  "better deal" than what's already on screen. */
  referencePrice?: ReferencePrice | null;
}) {
  const [offers, setOffers] = useState<MarketplaceOffer[]>(preloaded?.offers ?? []);
  const [deals, setDeals] = useState<RankedDeal[]>(preloaded?.deals ?? []);
  // Deals (ranked) stay a single blocking call - ranking "best deal" needs
  // the full offer set first, so there's no meaningful way to stream them.
  const [dealsLoading, setDealsLoading] = useState(!preloaded);
  // Offers (plain marketplace list) stream in via /compare/start+poll - this
  // tracks whether that stream has reported done yet, so a genuinely-empty
  // result (0 offers, done) can be told apart from "still checking" (0
  // offers, not done) rather than both looking like "no live prices found."
  const [offersStreaming, setOffersStreaming] = useState(!preloaded);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountryState] = useState<Country>("IN");

  useEffect(() => {
    getCountry().then(setCountryState).catch(() => {});
  }, []);

  useEffect(() => {
    if (preloaded) return;
    let alive = true;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    setDealsLoading(true);
    setOffersStreaming(true);
    setError(null);
    setOffers([]);
    setDeals([]);

    fetchDeals(product, undefined, referencePrice)
      .then((dealRes) => {
        if (alive) setDeals(dealRes?.deals ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setDealsLoading(false);
      });

    (async () => {
      try {
        const { jobId } = await startCompareJob(product, null, referencePrice);
        const poll = async () => {
          if (!alive) return;
          try {
            const res = await pollCompareJob(jobId);
            if (!alive) return;
            setOffers(res.offers ?? []);
            if (res.error) {
              setError(res.error);
              setOffersStreaming(false);
              return;
            }
            if (!res.done) {
              pollTimer = setTimeout(poll, 700);
              return;
            }
            setOffersStreaming(false);
            track("compare_viewed", { category: product.category, offerCount: res.offers?.length ?? 0 });
          } catch (e) {
            if (alive) {
              setError((e as Error).message);
              setOffersStreaming(false);
            }
          }
        };
        poll();
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
          setOffersStreaming(false);
        }
      }
    })();

    return () => {
      alive = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [product.name, product.searchTerm, preloaded]);

  const currency = country === "US" ? "USD" : "INR";
  // Hide (never relabel) any offer/deal whose currency doesn't match the
  // user's own country - see filterOffersByCurrency for why.
  const currencyOffers = useMemo(() => filterOffersByCurrency(offers, currency), [offers, currency]);
  const currencyDeals = useMemo(
    () => deals.filter((d) => !d.offer.currency || d.offer.currency === currency),
    [deals, currency]
  );
  const grouped = useMemo(() => groupOffersByKind(currencyOffers, country), [currencyOffers, country]);

  // Keep showing the spinner as long as EITHER path could still produce
  // something and nothing has arrived yet - not just while both are still
  // running. Without the `offersStreaming` half here, a fast-but-empty deals
  // response would flip straight to "no live prices found" while the offers
  // stream was still actively in flight and might yet add something.
  if ((dealsLoading || offersStreaming) && !currencyOffers.length && !currencyDeals.length && !error) {
    return (
      <Card>
        <View style={styles.head}>
          <Ionicons name="git-compare-outline" size={16} color={colors.accent} />
          <Text style={styles.title}>Compare everywhere</Text>
        </View>
        <LoadingState label="Checking Flipkart, Amazon and more…" />
      </Card>
    );
  }

  if (error && !currencyOffers.length && !currencyDeals.length) {
    return (
      <Card>
        <View style={styles.head}>
          <Ionicons name="git-compare-outline" size={16} color={colors.accent} />
          <Text style={styles.title}>Compare everywhere</Text>
        </View>
        <Text style={styles.err}>{error}</Text>
      </Card>
    );
  }

  if (!currencyOffers.length && !currencyDeals.length) {
    return (
      <Card>
        <EmptyState
          icon="pricetag-outline"
          message="No live prices found for this product right now - try again in a bit."
        />
      </Card>
    );
  }

  const bestDeal = currencyDeals[0];
  const listSource = currencyDeals.length ? currencyDeals.map((d) => d.offer) : currencyOffers;

  return (
    <View style={{ gap: space(3.5) }}>
      {bestDeal && Number.isFinite(bestDeal.finalPayable) && (
        <Card>
          <View style={styles.head}>
            <Ionicons name="trophy-outline" size={16} color={colors.accent} />
            <Text style={styles.title}>Best deal for you</Text>
          </View>
          <Tappable
            onPress={() => openRetailer(bestDeal.offer.url, bestDeal.offer.retailerId)}
            style={styles.dealHero}
            accessibilityLabel={`${bestDeal.offer.retailer} best deal`}
          >
            <Favicon url={retailerLogoUrl(bestDeal.offer.retailerId, bestDeal.offer.url)} size={22} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.dealRetailer}>{bestDeal.offer.retailer}</Text>
              <Text style={styles.dealTitle} numberOfLines={1}>
                {bestDeal.offer.title}
              </Text>
              {bestDeal.applied.length > 0 && (
                <Text style={styles.dealApplied} numberOfLines={2}>
                  {bestDeal.applied.map((a) => a.label).join(" · ")}
                </Text>
              )}
            </View>
            <View style={styles.dealPriceCol}>
              {bestDeal.totalSavings > 0 && (
                <Text style={styles.listStrike}>{formatMoney(bestDeal.listPrice, currency)}</Text>
              )}
              <Text style={styles.finalPrice}>{formatMoney(bestDeal.finalPayable, currency)}</Text>
              {bestDeal.totalSavings > 0 && (
                <Badge label={`Save ${formatMoney(bestDeal.totalSavings, currency)}`} color={colors.buy} />
              )}
            </View>
          </Tappable>
        </Card>
      )}

      <OfferList
        title="Marketplaces"
        offers={grouped.marketplaces.length ? grouped.marketplaces : listSource.filter((o) =>
          !grouped.quickCommerce.some((q) => q.url === o.url)
        )}
        deals={currencyDeals}
        currency={currency}
      />
      {grouped.quickCommerce.length > 0 && <LocationBanner />}
      <OfferList
        title="Quick commerce"
        offers={grouped.quickCommerce}
        deals={currencyDeals}
        currency={currency}
      />
    </View>
  );
}

function OfferList({
  title,
  offers,
  deals,
  currency,
}: {
  title: string;
  offers: MarketplaceOffer[];
  deals: RankedDeal[];
  currency: string;
}) {
  if (!offers.length) return null;
  return (
    <Card>
      <View style={styles.head}>
        <Ionicons name="git-compare-outline" size={16} color={colors.accent} />
        <Text style={styles.title}>{title}</Text>
      </View>
      {offers.slice(0, 6).map((o, i) => {
        const deal = deals.find((d) => d.offer.url === o.url);
        return (
          <Tappable
            key={`${o.url}-${i}`}
            onPress={() => {
              track("marketplace_deeplink_opened", { platform: o.retailerId, manual: Boolean(o.checkManually) });
              openRetailer(o.url, o.retailerId);
            }}
            style={[styles.row, i === 0 && styles.rowFirst]}
            accessibilityLabel={`${o.retailer} price`}
          >
            <Favicon url={retailerLogoUrl(o.retailerId, o.url)} size={20} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowRetailer}>{o.retailer}</Text>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {o.checkManually ? "Live price not available" : o.title}
              </Text>
              {!o.checkManually && o.inStock === false && <Text style={styles.oos}>Out of stock</Text>}
            </View>
            {o.checkManually ? (
              <View style={styles.manualCol}>
                <Ionicons name="open-outline" size={13} color={colors.textMuted} />
                <Text style={styles.manualText}>Check manually</Text>
              </View>
            ) : (
              <View style={styles.priceCol}>
                {deal && deal.totalSavings > 0 ? (
                  <>
                    <Text style={styles.listStrike}>{formatMoney(deal.listPrice, currency)}</Text>
                    <Text style={styles.rowPrice}>{formatMoney(deal.finalPayable, currency)}</Text>
                  </>
                ) : (
                  <Text style={styles.rowPrice}>
                    {o.price != null ? formatMoney(o.price, currency) : o.priceRaw ?? "—"}
                  </Text>
                )}
              </View>
            )}
          </Tappable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space(2), marginBottom: space(1) },
  title: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  err: { fontFamily: fonts.sans, fontSize: 13, color: colors.avoid },
  dealHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    padding: space(3),
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  dealRetailer: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.accent },
  dealTitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  dealApplied: { fontFamily: fonts.sans, fontSize: 11, color: colors.textFaint, marginTop: 4 },
  dealPriceCol: { alignItems: "flex-end", gap: 4 },
  listStrike: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textFaint,
    textDecorationLine: "line-through",
  },
  finalPrice: { fontFamily: fonts.monoBold, fontSize: 18, color: colors.buy },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2.5),
    paddingVertical: space(2.5),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowFirst: { borderTopWidth: 0 },
  rowRetailer: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.text },
  rowTitle: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  oos: { fontFamily: fonts.sans, fontSize: 11, color: colors.avoid, marginTop: 2 },
  priceCol: { alignItems: "flex-end" },
  rowPrice: { fontFamily: fonts.mono, fontSize: 14, color: colors.accent },
  manualCol: { flexDirection: "row", alignItems: "center", gap: 4 },
  manualText: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.textMuted },
});
