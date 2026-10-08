// server/catalog.ts — settings, stores and products
import type { DB } from "./db";
import type { DiscountRule, Product, Store, StoreAlert } from "../src/lib/types";
import type { DiscountCap } from "../src/lib/quote";

export type SiteSettings = {
  title: string;
  gst: number;
  classes: string[];
  alerts: StoreAlert[];
  discountCap: DiscountCap | null;
  /** printed on gift cards */
  giftCardFrom: string;
  giftCardValidUntil: string;
};

export const DEFAULT_SETTINGS: SiteSettings = {
  title: "School Cart",
  gst: 0.09,
  classes: [],
  alerts: [],
  discountCap: null,
  giftCardFrom: "",
  giftCardValidUntil: "",
};

export function getSettings(db: DB): SiteSettings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) out[r.key] = JSON.parse(r.value);
  }
  return out as SiteSettings;
}

export function saveSettings(db: DB, patch: Partial<SiteSettings>) {
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  for (const [k, v] of Object.entries(patch)) {
    if (k in DEFAULT_SETTINGS && v !== undefined) stmt.run(k, JSON.stringify(v));
  }
}

type StoreRow = {
  id: string;
  name: string;
  cover: string;
  sort_order: number;
  shipping_base_fee: number;
  max_qty_per_item: number;
  show_discount_breakdown: number;
  alerts: string;
  discounts: string;
};

type ProductRow = {
  store_id: string;
  sku: string;
  name: string;
  price: number;
  img: string;
  sort_order: number;
};

export type StoreWithCover = Store & { cover: string; sortOrder: number };

function toStore(r: StoreRow, products: Product[]): StoreWithCover {
  return {
    id: r.id,
    name: r.name,
    cover: r.cover,
    sortOrder: r.sort_order,
    alerts: JSON.parse(r.alerts) as StoreAlert[],
    shipping: { baseFee: r.shipping_base_fee },
    constraints: { maxQtyPerItem: r.max_qty_per_item },
    discounts: JSON.parse(r.discounts) as DiscountRule[],
    products,
    showDiscountBreakdown: r.show_discount_breakdown === 1,
  };
}

export function listStores(db: DB): StoreWithCover[] {
  const stores = db
    .prepare("SELECT * FROM stores ORDER BY sort_order, name")
    .all() as StoreRow[];
  const products = db
    .prepare("SELECT * FROM products ORDER BY sort_order, name")
    .all() as ProductRow[];
  return stores.map((s) =>
    toStore(
      s,
      products
        .filter((p) => p.store_id === s.id)
        .map(({ sku, name, price, img }) => ({ sku, name, price, img }))
    )
  );
}

export function getStore(db: DB, id: string): StoreWithCover | null {
  const s = db.prepare("SELECT * FROM stores WHERE id = ?").get(id) as
    | StoreRow
    | undefined;
  if (!s) return null;
  const products = db
    .prepare("SELECT * FROM products WHERE store_id = ? ORDER BY sort_order, name")
    .all(id) as ProductRow[];
  return toStore(
    s,
    products.map(({ sku, name, price, img }) => ({ sku, name, price, img }))
  );
}

export type StoreInput = {
  id: string;
  name: string;
  cover?: string;
  shippingBaseFee: number;
  maxQtyPerItem: number;
  showDiscountBreakdown: boolean;
  alerts: StoreAlert[];
  discounts: DiscountRule[];
};

export function insertStore(db: DB, s: StoreInput, sortOrder?: number) {
  const order =
    sortOrder ??
    ((db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM stores").get() as {
      n: number;
    }).n);
  db.prepare(
    `INSERT INTO stores (id, name, cover, sort_order, shipping_base_fee, max_qty_per_item,
       show_discount_breakdown, alerts, discounts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    s.id,
    s.name,
    s.cover ?? "",
    order,
    s.shippingBaseFee,
    s.maxQtyPerItem,
    s.showDiscountBreakdown ? 1 : 0,
    JSON.stringify(s.alerts),
    JSON.stringify(s.discounts)
  );
}

export function updateStore(db: DB, id: string, s: Omit<StoreInput, "id">) {
  return db
    .prepare(
      `UPDATE stores SET name = ?, cover = ?, shipping_base_fee = ?, max_qty_per_item = ?,
         show_discount_breakdown = ?, alerts = ?, discounts = ? WHERE id = ?`
    )
    .run(
      s.name,
      s.cover ?? "",
      s.shippingBaseFee,
      s.maxQtyPerItem,
      s.showDiscountBreakdown ? 1 : 0,
      JSON.stringify(s.alerts),
      JSON.stringify(s.discounts),
      id
    ).changes;
}

export function insertProduct(db: DB, storeId: string, p: Product, sortOrder?: number) {
  const order =
    sortOrder ??
    ((db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM products WHERE store_id = ?")
      .get(storeId) as { n: number }).n);
  db.prepare(
    "INSERT INTO products (store_id, sku, name, price, img, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(storeId, p.sku, p.name, p.price, p.img ?? "", order);
}
