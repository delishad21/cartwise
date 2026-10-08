// server/orders.ts — placing and voiding orders
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { nowIso, tx, type DB } from "./db";
import { getSettings, listStores } from "./catalog";
import { ApiError } from "./errors";
import { round2 } from "../src/lib/pricing";
import {
  normaliseCardNumber,
  normaliseCode,
  quoteOrder,
  type DiscountCode,
} from "../src/lib/quote";

export const orderSchema = z.object({
  name: z.string().trim().min(1).max(100),
  className: z.string().trim().min(1).max(50),
  justifications: z
    .array(z.object({ sku: z.string().min(1), text: z.string().trim().min(1).max(2000) }))
    .max(3),
  lines: z
    .array(
      z.object({
        storeId: z.string().min(1),
        sku: z.string().min(1),
        qty: z.number().int().positive(),
      })
    )
    .min(1)
    .max(200),
  codes: z.array(z.string().trim().min(1).max(40)).max(20),
  cardNumber: z.string().trim().min(1).max(40),
  /** what the browser showed; rejected if the server's total differs */
  expectedTotal: z.number(),
});

export type OrderInput = z.infer<typeof orderSchema>;

type VoucherRow = {
  code: string;
  kind: "percent" | "absolute";
  amount: number;
  description: string;
  used_at: string | null;
};

type CardRow = { number: string; group_name: string; balance: number };

/** Look up a voucher for the checkout preview. Throws if unusable. */
export function checkVoucher(db: DB, raw: string): DiscountCode {
  const v = db
    .prepare("SELECT * FROM vouchers WHERE code = ?")
    .get(normaliseCode(raw)) as VoucherRow | undefined;
  if (!v) throw new ApiError(404, "CODE_NOT_FOUND", "Code not recognised", { code: raw });
  if (v.used_at)
    throw new ApiError(409, "CODE_USED", `Code ${v.code} has already been used`, {
      code: v.code,
    });
  return { code: v.code, kind: v.kind, amount: v.amount, description: v.description };
}

export function placeOrder(db: DB, input: OrderInput) {
  const settings = getSettings(db);
  const stores = listStores(db);

  if (settings.classes.length > 0 && !settings.classes.includes(input.className)) {
    throw new ApiError(400, "BAD_GROUP", "Please pick your group from the list");
  }

  // ---- cart lines must exist and respect per-item limits
  const merged = new Map<string, { storeId: string; sku: string; qty: number }>();
  for (const l of input.lines) {
    const k = `${l.storeId}::${l.sku}`;
    const prev = merged.get(k);
    merged.set(k, { ...l, qty: (prev?.qty ?? 0) + l.qty });
  }
  const lines = [...merged.values()];
  for (const l of lines) {
    const store = stores.find((s) => s.id === l.storeId);
    const product = store?.products.find((p) => p.sku === l.sku);
    if (!store || !product) {
      throw new ApiError(409, "PRICE_CHANGED", "Some items in your cart are no longer sold. Go back to the shop, then open your cart again to see what changed.");
    }
    if (l.qty > store.constraints.maxQtyPerItem) {
      throw new ApiError(400, "QTY_LIMIT", `You can buy at most ${store.constraints.maxQtyPerItem} of ${product.name}`);
    }
  }

  const cartSkus = new Set(lines.map((l) => l.sku));
  if (input.justifications.some((j) => !cartSkus.has(j.sku))) {
    throw new ApiError(400, "BAD_JUSTIFICATION", "Justifications must be for items in your cart");
  }

  // ---- vouchers: known, unused, no duplicates, at most one percent code
  const seen = new Set<string>();
  const codes: DiscountCode[] = [];
  for (const raw of input.codes) {
    const code = normaliseCode(raw);
    if (seen.has(code)) continue;
    seen.add(code);
    codes.push(checkVoucher(db, code));
  }
  if (codes.filter((c) => c.kind === "percent").length > 1) {
    throw new ApiError(400, "TWO_PERCENT_CODES", "Only one percentage discount can be used");
  }

  // ---- authoritative price
  const quote = quoteOrder(stores, lines, settings.gst, codes, settings.discountCap);
  if (Math.abs(quote.grandTotal - input.expectedTotal) > 0.005) {
    throw new ApiError(409, "PRICE_CHANGED", "Prices were just updated by your teacher. Go back to the shop, then open your cart again to see the new total.", {
      grandTotal: quote.grandTotal,
    });
  }

  // ---- gift card
  const cardNumber = normaliseCardNumber(input.cardNumber);
  const card = db.prepare("SELECT * FROM cards WHERE number = ?").get(cardNumber) as
    | CardRow
    | undefined;
  if (!card) throw new ApiError(404, "CARD_NOT_FOUND", "Gift card not found");
  if (card.group_name && card.group_name !== input.className) {
    throw new ApiError(403, "CARD_WRONG_GROUP", `This gift card belongs to Group ${card.group_name}`);
  }
  if (card.balance + 1e-9 < quote.grandTotal) {
    throw new ApiError(402, "INSUFFICIENT_BALANCE", `Insufficient balance (available S$${card.balance.toFixed(2)})`, {
      balance: card.balance,
    });
  }

  const id = randomUUID();
  const createdAt = nowIso();
  const balanceBefore = card.balance;
  const balanceAfter = round2(balanceBefore - quote.grandTotal);

  const payload = {
    orderId: id,
    name: input.name,
    className: input.className,
    justifications: input.justifications,
    ...quote,
    paymentInfo: {
      giftCardNumber: cardNumber,
      balanceBefore,
      chargeAmount: quote.grandTotal,
      balanceAfter,
      authAt: createdAt,
    },
    createdAt,
  };

  // Conditional updates make double-spends impossible even if two requests race.
  tx(db, () => {
    const useCode = db.prepare(
      "UPDATE vouchers SET used_at = ?, used_order_id = ? WHERE code = ? AND used_at IS NULL"
    );
    for (const c of codes) {
      if (useCode.run(createdAt, id, c.code).changes !== 1) {
        throw new ApiError(409, "CODE_USED", `Code ${c.code} has already been used`, { code: c.code });
      }
    }
    const charged = db
      .prepare("UPDATE cards SET balance = ? WHERE number = ? AND balance = ?")
      .run(balanceAfter, cardNumber, balanceBefore);
    if (charged.changes !== 1) {
      throw new ApiError(409, "CARD_CHANGED", "Gift card balance changed, please try again");
    }
    db.prepare(
      `INSERT INTO orders (id, created_at, name, class_name, card_number, grand_total, codes, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      createdAt,
      input.name,
      input.className,
      cardNumber,
      quote.grandTotal,
      JSON.stringify(codes.map((c) => c.code)),
      JSON.stringify(payload)
    );
  });

  return payload;
}

/** Undo an order: refund the card and release its vouchers. */
export function voidOrder(db: DB, id: string) {
  tx(db, () => {
    const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as
      | { card_number: string; grand_total: number; voided_at: string | null }
      | undefined;
    if (!o) throw new ApiError(404, "NOT_FOUND", "Order not found");
    if (o.voided_at) return;
    db.prepare("UPDATE orders SET voided_at = ? WHERE id = ?").run(nowIso(), id);
    db.prepare("UPDATE cards SET balance = ROUND(balance + ?, 2) WHERE number = ?").run(
      o.grand_total,
      o.card_number
    );
    db.prepare("UPDATE vouchers SET used_at = NULL, used_order_id = NULL WHERE used_order_id = ?").run(id);
  });
}
