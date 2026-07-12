import type { MarketplaceOffer } from "../marketplaces/normalize.js";
import {
  OFFER_RULES,
  isRuleActive,
  type OfferRule,
  type PaymentMethodId,
} from "./offers.js";

export interface AppliedDeal {
  ruleId: string;
  label: string;
  method: PaymentMethodId;
  savings: number;
}

export interface RankedDeal {
  offer: MarketplaceOffer;
  listPrice: number;
  finalPayable: number;
  totalSavings: number;
  applied: AppliedDeal[];
  methodUsed: PaymentMethodId | null;
}

function ruleAppliesToMarketplace(rule: OfferRule, retailerId: string): boolean {
  if (rule.marketplaces === "*") return true;
  return rule.marketplaces.includes(retailerId);
}

function computeSavings(rule: OfferRule, price: number): number {
  if (rule.minCart && price < rule.minCart) return 0;
  let savings = 0;
  switch (rule.type) {
    case "percent_off":
      savings = (price * rule.value) / 100;
      if (rule.cap != null) savings = Math.min(savings, rule.cap);
      break;
    case "flat_cashback":
    case "coupon":
    case "membership_perk":
      savings = rule.value;
      break;
  }
  return Math.max(0, Math.min(savings, price));
}

/**
 * Deterministic effective-price calculator.
 * Picks best single method per offer (non-stacking by default) plus membership perks.
 */
export function calculateDeals(
  offers: MarketplaceOffer[],
  ownedMethods: PaymentMethodId[],
  now = new Date()
): RankedDeal[] {
  const owned = new Set(ownedMethods);
  const activeRules = OFFER_RULES.filter((r) => isRuleActive(r, now));

  const ranked: RankedDeal[] = [];

  for (const offer of offers) {
    if (offer.price == null || offer.price <= 0) {
      ranked.push({
        offer,
        listPrice: 0,
        finalPayable: Infinity,
        totalSavings: 0,
        applied: [],
        methodUsed: null,
      });
      continue;
    }

    const listPrice = offer.price;
    const eligible = activeRules.filter(
      (r) =>
        ruleAppliesToMarketplace(r, offer.retailerId) &&
        r.methods.some((m) => owned.has(m))
    );

    // Best card/wallet discount (pick max savings among non-membership)
    let best: AppliedDeal | null = null;
    for (const rule of eligible.filter((r) => r.type !== "membership_perk")) {
      const method = rule.methods.find((m) => owned.has(m))!;
      const savings = computeSavings(rule, listPrice);
      if (savings <= 0) continue;
      if (!best || savings > best.savings) {
        best = { ruleId: rule.id, label: rule.label, method, savings };
      }
    }

    const applied: AppliedDeal[] = [];
    let totalSavings = 0;
    if (best) {
      applied.push(best);
      totalSavings += best.savings;
    }

    // Membership perks stack (shipping value)
    for (const rule of eligible.filter((r) => r.type === "membership_perk")) {
      const method = rule.methods.find((m) => owned.has(m))!;
      const savings = computeSavings(rule, listPrice);
      if (savings <= 0) continue;
      applied.push({ ruleId: rule.id, label: rule.label, method, savings });
      totalSavings += savings;
    }

    ranked.push({
      offer,
      listPrice,
      finalPayable: Math.max(0, listPrice - totalSavings),
      totalSavings,
      applied,
      methodUsed: best?.method ?? applied[0]?.method ?? null,
    });
  }

  return ranked
    .filter((d) => Number.isFinite(d.finalPayable))
    .sort((a, b) => a.finalPayable - b.finalPayable);
}
