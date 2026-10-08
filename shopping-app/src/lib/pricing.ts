import type { DiscountRule, Product } from "./types";
import type { StoreTotals, PricedItem } from "./types";

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function sumDiscounts(i: PricedItem) {
  return round2(i.discounts.reduce((a, d) => a + d.amount, 0));
}

function nthFormat(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return n + "st";
  if (n % 10 === 2 && n % 100 !== 12) return n + "nd";
  if (n % 10 === 3 && n % 100 !== 13) return n + "rd";
  return n + "th";
}

/**
 * GST is computed on ITEMS ONLY.
 * Final total = itemsNet + gst + shippingNet
 *
 * Rules supported:
 * - { type: "nthItemPercent", nth, percentOff }  ➜ discount k = floor(U/nth) cheapest units
 * - { type: "overallPercent",  percentOff }      ➜ allocate proportionally across items (post-nth)
 * - { type: "shippingThreshold", threshold, shippingPercentOff } ➜ discounted shipping
 */
export function priceStore(
  productsBySku: Record<string, Product>,
  lines: { sku: string; qty: number }[],
  discounts: DiscountRule[],
  baseShipping: number,
  gstRate: number = 0.09
): StoreTotals {
  const perItem: PricedItem[] = [];
  const units: Array<{ sku: string; unitPrice: number; idxInItem: number }> =
    [];

  for (const { sku, qty } of lines) {
    const p = productsBySku[sku];
    if (!p || qty <= 0) continue;

    for (let i = 0; i < qty; i++)
      units.push({ sku, unitPrice: p.price, idxInItem: i });

    perItem.push({
      storeId: "",
      sku,
      name: p.name,
      img: p.img ?? "",
      qty,
      unitPrice: p.price,
      originalLineTotal: round2(p.price * qty),
      discounts: [],
      finalLineTotal: 0,
    });
  }

  const itemsSubtotal = round2(
    perItem.reduce((a, i) => a + i.originalLineTotal, 0)
  );

  // ---- Nth (k cheapest units) ----
  const nthRule = discounts.find((d) => d.type === "nthItemPercent") as
    | { type: "nthItemPercent"; nth: number; percentOff: number }
    | undefined;

  const nthAppliedUnits: { sku: string; unitPrice: number; amount: number }[] =
    [];

  if (nthRule && nthRule.nth > 0) {
    const U = units.length;
    const k = Math.floor(U / nthRule.nth);
    if (k > 0) {
      const chosen = [...units]
        .sort((a, b) => a.unitPrice - b.unitPrice)
        .slice(0, k);
      for (const u of chosen) {
        const amt = round2((u.unitPrice * nthRule.percentOff) / 100);
        if (amt <= 0) continue;
        const item = perItem.find((i) => i.sku === u.sku);
        if (!item) continue;
        item.discounts.push({
          kind: "nthItemPercent",
          label: `${nthRule.percentOff}% off (${nthFormat(nthRule.nth)} item)`,
          amount: amt,
        });
        nthAppliedUnits.push({
          sku: u.sku,
          unitPrice: u.unitPrice,
          amount: amt,
        });
      }
    }
  }

  // Base after nth discounts
  const afterNthBase = round2(
    perItem.reduce((a, i) => a + (i.originalLineTotal - sumDiscounts(i)), 0)
  );

  // ---- Storewide overall% (proportional, with remainder fix) ----
  const overall = discounts.find((d) => d.type === "overallPercent") as
    | { type: "overallPercent"; percentOff: number }
    | undefined;

  if (overall && overall.percentOff > 0 && afterNthBase > 0) {
    const targetTotal = round2((overall.percentOff / 100) * afterNthBase);
    let running = 0;
    for (let idx = 0; idx < perItem.length; idx++) {
      const i = perItem[idx];
      const base = round2(i.originalLineTotal - sumDiscounts(i));
      if (base <= 0) continue;

      // last positive-base item gets remainder to kill rounding drift
      const isLast = (() => {
        for (let j = idx + 1; j < perItem.length; j++) {
          const b = round2(
            perItem[j].originalLineTotal - sumDiscounts(perItem[j])
          );
          if (b > 0) return false;
        }
        return true;
      })();

      let allocAmt: number;
      if (isLast) {
        allocAmt = round2(targetTotal - running);
      } else {
        allocAmt = round2((base / afterNthBase) * targetTotal);
        running = round2(running + allocAmt);
      }

      if (allocAmt > 0) {
        i.discounts.push({
          kind: "overallPercent",
          label: `Storewide ${overall.percentOff}% off`,
          amount: allocAmt,
        });
      }
    }
  }

  // ---- Item totals after all item-level discounts ----
  const itemsDiscount = round2(
    perItem.reduce((a, i) => a + sumDiscounts(i), 0)
  );
  const itemsNet = round2(itemsSubtotal - itemsDiscount);

  // ---- Shipping AFTER GST (no GST on shipping) ----
  const shipRule = discounts.find((d) => d.type === "shippingThreshold") as
    | {
        type: "shippingThreshold";
        threshold: number;
        shippingPercentOff: number;
      }
    | undefined;

  const shippingBase = round2(baseShipping);
  const shippingDiscount =
    shipRule && itemsNet >= shipRule.threshold
      ? round2((shippingBase * shipRule.shippingPercentOff) / 100)
      : 0;
  const shippingNet = round2(Math.max(0, shippingBase - shippingDiscount));

  // ---- GST on ITEMS ONLY ----
  const gstBase = itemsNet; // explicitly the items base
  const gst = round2(gstBase * gstRate);

  // Final store total: items + GST + shipping
  const storeTotal = round2(itemsNet + gst + shippingNet);

  // finalize per-item lines
  for (const i of perItem) {
    i.finalLineTotal = round2(i.originalLineTotal - sumDiscounts(i));
  }

  return {
    itemsSubtotal,
    itemsDiscount,
    itemsNet,
    shippingBase,
    shippingDiscount,
    shippingNet,
    gst,
    storeTotal,
    perItem,
    discountFlags: {
      nthAppliedUnits,
      overallPercent: overall?.percentOff,
    },
  };
}
