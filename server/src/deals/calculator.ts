import type { MarketplaceOffer, ReferencePrice } from "../marketplaces/normalize.js";
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
  /**
   * True when this offer's price has been verified as a genuine improvement
   * over the caller-supplied reference (on-screen) price: same currency and
   * strictly lower than `reference.amount`. False whenever a reference price
   * was supplied but the comparison can't clear that bar (higher/equal price,
   * currency mismatch, or the offer is the user's own current listing). When
   * no reference price is supplied at all (caller has no "current page" to
   * compare against, e.g. Direct Search), defaults to true - unchanged legacy
   * behavior. Only offers with verifiedDeal === true are returned by
   * calculateDeals - callers must never badge an unverified offer as a "deal".
   */
  verifiedDeal: boolean;
}

/**
 * Hard sanity guard: a listing can only be called a "deal" relative to the
 * reference (current on-screen) price when the comparison is unambiguous -
 * same currency, strictly cheaper, and not the same listing the user is
 * already on. This is intentionally strict: when in doubt, this returns false
 * and the caller degrades to a neutral price display instead of asserting a
 * false "better deal" claim.
 */
function isVerifiedDeal(
  offer: MarketplaceOffer,
  finalPayable: number,
  reference: ReferencePrice | null | undefined
): boolean {
  // The user's own current listing (matched by retailerId in applyReferenceGuard)
  // is never "a deal" relative to itself, no matter what card discount applies.
  if (offer.isCurrentListing) return false;
  if (!reference) return true;
  if (offer.currency !== reference.currency) return false;
  return finalPayable < reference.amount;
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
 *
 * `reference` is the price the user is already looking at (extracted live from
 * their own screen) - when supplied, any offer that isn't verifiably cheaper
 * (same currency, strictly lower final price, not the user's own current
 * listing) is dropped from the returned deals rather than risk badging a
 * worse or unverifiable price as a "deal". See isVerifiedDeal above.
 */
export function calculateDeals(
  offers: MarketplaceOffer[],
  ownedMethods: PaymentMethodId[],
  opts: { now?: Date; reference?: ReferencePrice | null } = {}
): RankedDeal[] {
  const now = opts.now ?? new Date();
  const reference = opts.reference ?? null;
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
        verifiedDeal: false,
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

    const finalPayable = Math.max(0, listPrice - totalSavings);
    ranked.push({
      offer,
      listPrice,
      finalPayable,
      totalSavings,
      applied,
      methodUsed: best?.method ?? applied[0]?.method ?? null,
      verifiedDeal: isVerifiedDeal(offer, finalPayable, reference),
    });
  }

  return ranked
    .filter((d) => Number.isFinite(d.finalPayable) && d.verifiedDeal)
    .sort((a, b) => a.finalPayable - b.finalPayable);
}
