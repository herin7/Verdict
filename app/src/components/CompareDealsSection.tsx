import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "./Tappable";
import { Badge } from "./Badge";
import { Card } from "./ui";
import { colors, fonts, radius, space } from "../theme";
import { compareEverywhere, fetchDeals } from "../api/client";
import { getCountry, type Country } from "../country";
import { openRetailer } from "../deeplink";
import { formatMoney } from "../format";
import { groupOffersByKind } from "../retailers";
import type { MarketplaceOffer, ProductIdentity, RankedDeal } from "../types";

export function CompareDealsSection({ product }: { product: ProductIdentity }) {
  const [offers, setOffers] = useState<MarketplaceOffer[]>([]);
  const [deals, setDeals] = useState<RankedDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountryState] = useState<Country>("IN");

  useEffect(() => {
    getCountry().then(setCountryState).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [cmp, dealRes] = await Promise.all([
          compareEverywhere(product),
          fetchDeals(product).catch(() => null),
        ]);
        if (!alive) return;
        setOffers(cmp.offers ?? []);
        setDeals(dealRes?.deals ?? []);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [product.name, product.searchTerm]);

  const grouped = useMemo(() => groupOffersByKind(offers, country), [offers, country]);
  const currency = country === "US" ? "USD" : "INR";

  if (loading) {
    return (
      <Card>
        <View style={styles.head}>
          <Ionicons name="git-compare-outline" size={16} color={colors.accent} />
          <Text style={styles.title}>Compare Everywhere</Text>
        </View>
        <ActivityIndicator color={colors.accent} style={{ marginVertical: space(4) }} />
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <View style={styles.head}>
          <Ionicons name="git-compare-outline" size={16} color={colors.accent} />
          <Text style={styles.title}>Compare Everywhere</Text>
        </View>
        <Text style={styles.err}>{error}</Text>
      </Card>
    );
  }

  if (!offers.length && !deals.length) return null;

  const bestDeal = deals[0];
  const listSource = deals.length ? deals.map((d) => d.offer) : offers;

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
          >
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
                <Text style={styles.listStrike}>
                  {formatMoney(bestDeal.listPrice, bestDeal.offer.currency || currency)}
                </Text>
              )}
              <Text style={styles.finalPrice}>
                {formatMoney(bestDeal.finalPayable, bestDeal.offer.currency || currency)}
              </Text>
              {bestDeal.totalSavings > 0 && (
                <Badge
                  label={`Save ${formatMoney(bestDeal.totalSavings, bestDeal.offer.currency || currency)}`}
                  color={colors.buy}
                />
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
        deals={deals}
        currency={currency}
      />
      <OfferList
        title="Quick commerce"
        offers={grouped.quickCommerce}
        deals={deals}
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
            onPress={() => openRetailer(o.url, o.retailerId)}
            style={[styles.row, i === 0 && styles.rowFirst]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowRetailer}>{o.retailer}</Text>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {o.title}
              </Text>
              {o.inStock === false && <Text style={styles.oos}>Out of stock</Text>}
            </View>
            <View style={styles.priceCol}>
              {deal && deal.totalSavings > 0 ? (
                <>
                  <Text style={styles.listStrike}>
                    {formatMoney(deal.listPrice, o.currency || currency)}
                  </Text>
                  <Text style={styles.rowPrice}>
                    {formatMoney(deal.finalPayable, o.currency || currency)}
                  </Text>
                </>
              ) : (
                <Text style={styles.rowPrice}>
                  {o.price != null ? formatMoney(o.price, o.currency || currency) : o.priceRaw ?? "—"}
                </Text>
              )}
            </View>
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
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  rowFirst: { borderTopWidth: 0 },
  rowRetailer: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.text },
  rowTitle: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  oos: { fontFamily: fonts.sans, fontSize: 11, color: colors.avoid, marginTop: 2 },
  priceCol: { alignItems: "flex-end" },
  rowPrice: { fontFamily: fonts.mono, fontSize: 14, color: colors.accent },
});
