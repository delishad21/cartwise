// src/lib/quote.ts
// Shared by the browser (live preview) and the server (authoritative charge),
// so both always agree on the grand total.
import { priceStore, round2 } from "./pricing";
import type { Product, Store } from "./types";

export type DiscountCode = {
  code: string;
  kind: "percent" | "absolute";
  amount: number;
  description?: string;
};

export type DiscountCap = {
  percentMax?: number; // max % off grand total (e.g. 25 → 25%)
  absoluteMax?: number; // max absolute dollars off
};

export type CodeDiscounts = {
  grandBeforeCodes: number;
  percentCode?: DiscountCode;
  percentDiscountAmount: number;
  absoluteDiscountAmount: number;
  grandAfterCodes: number;
  capApplied: boolean;
};

/**
 * Apply voucher codes to the grand total.
 * - at most one percent code counts (callers enforce, last one wins here)
 * - absolute codes stack
 * - the combined discount is capped by discountCap and by the total itself
 */
export function applyDiscountCodes(
  grandTotalRaw: number,
  codes: DiscountCode[],
  cap: DiscountCap | null | undefined
): CodeDiscounts {
  const grandBefore = round2(grandTotalRaw);

  if (grandBefore <= 0 || codes.length === 0) {
    return {
      grandBeforeCodes: grandBefore,
      percentDiscountAmount: 0,
      absoluteDiscountAmount: 0,
      grandAfterCodes: grandBefore,
      capApplied: false,
    };
  }

  let pc: DiscountCode | undefined;
  const absCodes: DiscountCode[] = [];
  for (const dc of codes) {
    if (dc.kind === "percent") pc = dc;
    else absCodes.push(dc);
  }

  const rawPercentAmt =
    pc && pc.amount > 0 ? round2((grandBefore * pc.amount) / 100) : 0;

  const rawAbsTotal = absCodes.reduce(
    (sum, dc) => sum + Math.max(0, dc.amount),
    0
  );

  const capAbsValue =
    cap && typeof cap.absoluteMax === "number"
      ? Math.max(0, cap.absoluteMax)
      : Number.POSITIVE_INFINITY;

  const capPercentValue =
    cap && typeof cap.percentMax === "number"
      ? Math.max(0, (grandBefore * cap.percentMax) / 100)
      : Number.POSITIVE_INFINITY;

  const maxAllowedTotal = Math.min(grandBefore, capAbsValue, capPercentValue);

  let usedPercent = rawPercentAmt;
  let usedAbs = rawAbsTotal;
  let capApplied = false;

  if (rawPercentAmt + rawAbsTotal > maxAllowedTotal) {
    capApplied = true;
    usedPercent = Math.min(rawPercentAmt, maxAllowedTotal);
    usedAbs = Math.min(rawAbsTotal, Math.max(0, maxAllowedTotal - usedPercent));
  }

  usedPercent = round2(usedPercent);
  usedAbs = round2(usedAbs);

  return {
    grandBeforeCodes: grandBefore,
    percentCode: pc,
    percentDiscountAmount: usedPercent,
    absoluteDiscountAmount: usedAbs,
    grandAfterCodes: round2(Math.max(0, grandBefore - usedPercent - usedAbs)),
    capApplied,
  };
}

export type OrderItem = {
  storeId: string;
  storeName?: string;
  sku: string;
  name: string;
  img?: string;
  qty: number;
  unitPrice: number;
  originalLineTotal: number;
  finalLineTotal: number;
  discounts: { label: string; amount: number }[];
  lineTotal: number;
};

export type StoreTotalsSummary = {
  storeId: string;
  storeName?: string;
  itemsSubtotal: number;
  itemsDiscount: number;
  itemsNet: number;
  shippingBase: number;
  shippingDiscount: number;
  shippingNet: number;
  gst: number;
  storeTotal: number;
};

export type OverallDiscountsSummary = {
  grandTotalBeforeDiscounts: number;
  grandTotalAfterDiscounts: number;
  percentDiscountAmount: number;
  absoluteDiscountAmount: number;
  appliedCodes: DiscountCode[];
  capApplied?: boolean;
  configuredCap?: DiscountCap | null;
};

export type OrderQuote = {
  items: OrderItem[];
  perStoreTotals: StoreTotalsSummary[];
  overallDiscounts?: OverallDiscountsSummary;
  grandTotal: number;
};

/** Price a whole cart across stores, then apply voucher codes. */
export function quoteOrder(
  stores: Store[],
  lines: { storeId: string; sku: string; qty: number }[],
  gstRate: number,
  codes: DiscountCode[],
  cap: DiscountCap | null | undefined
): OrderQuote {
  const items: OrderItem[] = [];
  const perStoreTotals: StoreTotalsSummary[] = [];

  for (const store of [...stores].sort((a, b) => a.id.localeCompare(b.id))) {
    const storeLines = lines
      .filter((l) => l.storeId === store.id && l.qty > 0)
      .map(({ sku, qty }) => ({ sku, qty }));
    if (storeLines.length === 0) continue;

    const productsBySku: Record<string, Product> = {};
    for (const p of store.products) productsBySku[p.sku] = p;

    const totals = priceStore(
      productsBySku,
      storeLines,
      store.discounts,
      store.shipping.baseFee,
      gstRate
    );
    if (totals.perItem.length === 0) continue;

    for (const pi of totals.perItem) {
      items.push({
        storeId: store.id,
        storeName: store.name,
        sku: pi.sku,
        name: pi.name,
        img: pi.img,
        qty: pi.qty,
        unitPrice: pi.unitPrice,
        originalLineTotal: pi.originalLineTotal,
        finalLineTotal: pi.finalLineTotal,
        discounts: pi.discounts.map((d) => ({
          label: d.label,
          amount: d.amount,
        })),
        lineTotal: pi.finalLineTotal,
      });
    }

    perStoreTotals.push({
      storeId: store.id,
      storeName: store.name,
      itemsSubtotal: totals.itemsSubtotal,
      itemsDiscount: totals.itemsDiscount,
      itemsNet: totals.itemsNet,
      shippingBase: totals.shippingBase,
      shippingDiscount: totals.shippingDiscount,
      shippingNet: totals.shippingNet,
      gst: totals.gst,
      storeTotal: totals.storeTotal,
    });
  }

  const grandRaw = perStoreTotals.reduce((a, s) => a + s.storeTotal, 0);
  const d = applyDiscountCodes(grandRaw, codes, cap);

  const overallDiscounts: OverallDiscountsSummary | undefined =
    codes.length === 0
      ? undefined
      : {
          grandTotalBeforeDiscounts: d.grandBeforeCodes,
          grandTotalAfterDiscounts: d.grandAfterCodes,
          percentDiscountAmount: d.percentDiscountAmount,
          absoluteDiscountAmount: d.absoluteDiscountAmount,
          appliedCodes: codes.map((c) => ({
            code: c.code,
            kind: c.kind,
            amount: c.amount,
            description: c.description ?? "",
          })),
          capApplied: d.capApplied,
          configuredCap: cap ?? null,
        };

  return { items, perStoreTotals, overallDiscounts, grandTotal: d.grandAfterCodes };
}

/** Card numbers are printed in groups of 4; strip anything that isn't a digit. */
export function normaliseCardNumber(s: string) {
  return s.replace(/\s+/g, "");
}

export function normaliseCode(s: string) {
  return s.trim().toUpperCase();
}
