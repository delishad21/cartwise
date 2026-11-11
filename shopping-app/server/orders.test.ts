// server/orders.test.ts — the justification rule in placeOrder. Run with `npm test`.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { nowIso, openDb, type DB } from "./db";
import { getSettings, insertProduct, insertStore, listStores, saveSettings } from "./catalog";
import { ApiError } from "./errors";
import { orderSchema, placeOrder } from "./orders";
import { quoteOrder } from "../src/lib/quote";

let dir: string;
let db: DB;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "cartwise-test-"));
  db = openDb(dir);
  insertStore(db, {
    id: "bikes",
    name: "Bikes",
    shippingBaseFee: 0,
    maxQtyPerItem: 5,
    showDiscountBreakdown: true,
    alerts: [],
    discounts: [],
  });
  for (const sku of ["a", "b", "c", "d"]) insertProduct(db, "bikes", { sku, name: sku.toUpperCase(), price: 1, img: "" });
  db.prepare("INSERT INTO cards (number, group_name, initial_balance, balance, created_at) VALUES (?, '', 1000, 1000, ?)").run(
    "1234567890123456",
    nowIso()
  );
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Place an order for `skus` (one each) with justifications for `justified`. */
function order(skus: string[], justified: string[], text = "because") {
  const lines = skus.map((sku) => ({ storeId: "bikes", sku, qty: 1 }));
  const s = getSettings(db);
  const total = quoteOrder(listStores(db), lines, s.gst, [], s.discountCap).grandTotal;
  return placeOrder(
    db,
    orderSchema.parse({
      name: "Ann",
      className: "1",
      justifications: justified.map((sku) => ({ sku, text })),
      lines,
      codes: [],
      cardNumber: "1234567890123456",
      expectedTotal: total,
    })
  );
}

const rejects = (fn: () => unknown, pattern: RegExp) =>
  assert.throws(fn, (e) => e instanceof ApiError && e.code === "BAD_JUSTIFICATION" && pattern.test(e.message));

test("default is 3, as before", () => {
  assert.equal(getSettings(db).justificationsRequired, 3);
  assert.equal(order(["a", "b", "c", "d"], ["a", "b", "c"]).justifications.length, 3);
  rejects(() => order(["a", "b", "c", "d"], ["a", "b"]), /justify 3 products/);
  rejects(() => order(["a", "b", "c", "d"], []), /justify 3 products/);
});

test("setting 3 with fewer products in the cart: justify all of them", () => {
  saveSettings(db, { justificationsRequired: 3 });
  assert.equal(order(["a", "b"], ["a", "b"]).justifications.length, 2);
  rejects(() => order(["a", "b"], ["a"]), /justify 2 products/);
  assert.equal(order(["a"], ["a"]).justifications.length, 1);
});

test("setting 1: exactly one justification", () => {
  saveSettings(db, { justificationsRequired: 1 });
  assert.equal(order(["a", "b", "c"], ["b"]).justifications.length, 1);
  rejects(() => order(["a", "b", "c"], []), /justify 1 product\b/);
  rejects(() => order(["a", "b", "c"], ["a", "b"]), /justify 1 product\b/);
});

test("setting 0: justifications off", () => {
  saveSettings(db, { justificationsRequired: 0 });
  assert.equal(order(["a", "b"], []).justifications.length, 0);
  rejects(() => order(["a", "b"], ["a"]), /aren't needed/);
});

test("whitespace-only text is rejected", () => {
  rejects(() => order(["a"], ["a"], "   \n  "), /write a reason/);
  saveSettings(db, { justificationsRequired: 1 });
  rejects(() => order(["a", "b"], ["a"], "\t"), /write a reason/);
});

test("the same product twice, or one not in the cart, is rejected", () => {
  rejects(() => order(["a", "b"], ["a", "a"]), /same one twice/);
  rejects(() => order(["a", "b"], ["a", "z"]), /in your cart/);
});

test("a rejected order charges nothing", () => {
  rejects(() => order(["a"], []), /justify 1 product\b/);
  const card = db.prepare("SELECT balance FROM cards").get() as { balance: number };
  assert.equal(card.balance, 1000);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM orders").get() as { n: number }).n, 0);
});
