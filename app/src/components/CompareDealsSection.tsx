import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tappable } from "./Tappable";
import { Badge } from "./Badge";
import { colors, fonts, radius } from "../theme";
import { compareEverywhere, fetchDeals } from "../api/client";
import type { MarketplaceOffer, ProductIdentity, RankedDeal } from "../types";

function formatInr(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function CompareDealsSection({ product }: { product: ProductIdentity }) {
  const [offers, setOffers] = useState<MarketplaceOffer[]>([]);
  const [deals, setDeals] = useState<RankedDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <View style={styles.box}>
        <View style={styles.head}>
          <Ionicons name="git-compare-outline" size={16} color={colors.accent} />
          <Text style={styles.title}>Compare Everywhere</Text>
        </View>
        <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.box}>
        <View style={styles.head}>
          <Ionicons name="git-compare-outline" size={16} color={colors.accent} />
          <Text style={styles.title}>Compare Everywhere</Text>
        </View>
        <Text style={styles.err}>{error}</Text>
      </View>
    );
  }

  if (!offers.length && !deals.length) return null;

  const bestDeal = deals[0];

  return (
    <View style={{ gap: 14 }}>
      {bestDeal && Number.isFinite(bestDeal.finalPayable) && (
        <View style={styles.box}>
          <View style={styles.head}>
            <Ionicons name="trophy-outline" size={16} color={colors.accent} />
            <Text style={styles.title}>Best deal for you</Text>
          </View>
          <Tappable onPress={() => Linking.openURL(bestDeal.offer.url)} style={styles.dealHero}>
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
                <Text style={styles.listStrike}>{formatInr(bestDeal.listPrice)}</Text>
              )}
              <Text style={styles.finalPrice}>{formatInr(bestDeal.finalPayable)}</Text>
              {bestDeal.totalSavings > 0 && (
                <Badge label={`Save ${formatInr(bestDeal.totalSavings)}`} color={colors.buy} />
              )}
            </View>
          </Tappable>
        </View>
      )}

      <View style={styles.box}>
        <View style={styles.head}>
          <Ionicons name="git-compare-outline" size={16} color={colors.accent} />
          <Text style={styles.title}>Compare Everywhere</Text>
        </View>
        {(deals.length ? deals.map((d) => d.offer) : offers).slice(0, 6).map((o, i) => {
          const deal = deals.find((d) => d.offer.url === o.url);
          return (
            <Tappable
              key={`${o.url}-${i}`}
              onPress={() => Linking.openURL(o.url)}
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
                    <Text style={styles.listStrike}>{formatInr(deal.listPrice)}</Text>
                    <Text style={styles.rowPrice}>{formatInr(deal.finalPayable)}</Text>
                  </>
                ) : (
                  <Text style={styles.rowPrice}>
                    {o.price != null ? formatInr(o.price) : o.priceRaw ?? "—"}
                  </Text>
                )}
              </View>
            </Tappable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 14,
    gap: 8,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  title: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  err: { fontFamily: fonts.sans, fontSize: 13, color: colors.avoid },
  dealHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
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
    gap: 10,
    paddingVertical: 10,
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
