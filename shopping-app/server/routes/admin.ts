// server/routes/admin.ts — everything behind the /admin password
import { randomBytes } from "node:crypto";
import { createWriteStream, mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { nowIso, tx, type DB } from "../db";
import {
  getSettings,
  insertProduct,
  insertStore,
  listStores,
  saveSettings,
  updateStore,
} from "../catalog";
import { adminEnabled, isLoggedIn, login, logout, requireAdmin } from "../auth";
import { newCardNumber, newVoucherCode } from "../codes";
import { ApiError } from "../errors";
import { voidOrder } from "../orders";
import { giftCardsHtml, vouchersHtml } from "../printables";
import { normaliseCardNumber, normaliseCode } from "../../src/lib/quote";

// ---------------------------------------------------------------- schemas

const money = z.number().finite().min(0).max(1_000_000);
const alertSchema = z.object({
  message: z.string().trim().min(1).max(500),
  severity: z.enum(["info", "success", "warning", "error"]).optional(),
});
const discountRule = z.discriminatedUnion("type", [
  z.object({ type: z.literal("nthItemPercent"), nth: z.number().int().min(1), percentOff: z.number().min(0).max(100) }),
  z.object({ type: z.literal("overallPercent"), percentOff: z.number().min(0).max(100) }),
  z.object({ type: z.literal("shippingThreshold"), threshold: money, shippingPercentOff: z.number().min(0).max(100) }),
]);
const slug = z.string().trim().min(1).max(60).regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers and dashes");
const imgUrl = z.string().trim().max(500);

const storeBody = z.object({
  name: z.string().trim().min(1).max(100),
  cover: imgUrl.default(""),
  shippingBaseFee: money,
  maxQtyPerItem: z.number().int().min(1).max(99),
  showDiscountBreakdown: z.boolean(),
  alerts: z.array(alertSchema).max(20),
  discounts: z
    .array(discountRule)
    .max(3)
    .refine((d) => new Set(d.map((r) => r.type)).size === d.length, "Each discount type can be used once"),
});

const productBody = z.object({
  sku: slug,
  name: z.string().trim().min(1).max(100),
  price: money,
  img: imgUrl.default(""),
});

const settingsBody = z.object({
  title: z.string().trim().min(1).max(100),
  gst: z.number().min(0).max(1),
  classes: z.array(z.string().trim().min(1).max(50)).max(500),
  alerts: z.array(alertSchema).max(20),
  discountCap: z
    .object({ percentMax: z.number().min(0).max(100).optional(), absoluteMax: money.optional() })
    .nullable(),
  giftCardFrom: z.string().trim().max(60),
  giftCardValidUntil: z.string().trim().max(60),
});

const voucherKind = z.enum(["percent", "absolute"]);

// ---------------------------------------------------------------- helpers

function csv(rows: (string | number | null | undefined)[][]) {
  return (
    rows
      .map((r) =>
        r
          .map((v) => {
            const s = v == null ? "" : String(v);
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      )
      .join("\r\n") + "\r\n"
  );
}

function sendCsv(reply: FastifyReply, name: string, rows: Parameters<typeof csv>[0]) {
  reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${name}"`);
  return "﻿" + csv(rows); // BOM so Excel reads UTF-8
}

const voucherDescription = (kind: string, amount: number) =>
  kind === "percent" ? `${amount}% off the whole order` : `S$${amount} off the grand total`;

type OrderRow = {
  id: string;
  created_at: string;
  name: string;
  class_name: string;
  card_number: string;
  grand_total: number;
  codes: string;
  payload: string;
  voided_at: string | null;
};

const IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

// ---------------------------------------------------------------- routes

export function adminRoutes(app: FastifyInstance, db: DB, uploadsDir: string) {
  // ---- session
  app.get("/api/admin/me", async (req) => ({ enabled: adminEnabled(), loggedIn: isLoggedIn(req) }));

  app.post("/api/admin/login", async (req, reply) => {
    const { password } = z.object({ password: z.string().max(200) }).parse(req.body);
    login(req, reply, password);
    return { ok: true };
  });

  app.post("/api/admin/logout", async (req, reply) => {
    logout(req, reply);
    return { ok: true };
  });

  // everything registered below needs a session
  app.register(async (r) => {
    r.addHook("onRequest", requireAdmin);

    // ---- overview
    r.get("/api/admin/overview", async () => {
      const s = getSettings(db);
      const orders = db
        .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(grand_total), 0) AS spent, COUNT(DISTINCT class_name) AS groups FROM orders WHERE voided_at IS NULL")
        .get() as { n: number; spent: number; groups: number };
      const vouchers = db
        .prepare("SELECT kind, amount, COUNT(*) AS total, COUNT(used_at) AS used FROM vouchers GROUP BY kind, amount ORDER BY kind DESC, amount")
        .all();
      const cards = db
        .prepare("SELECT COUNT(*) AS total, SUM(balance < initial_balance) AS used, COALESCE(SUM(balance), 0) AS remaining FROM cards")
        .get() as { total: number; used: number | null; remaining: number };
      const recent = (
        db.prepare("SELECT id, created_at, name, class_name, grand_total FROM orders WHERE voided_at IS NULL ORDER BY created_at DESC LIMIT 8").all() as Pick<
          OrderRow,
          "id" | "created_at" | "name" | "class_name" | "grand_total"
        >[]
      ).map((o) => ({ id: o.id, createdAt: o.created_at, name: o.name, group: o.class_name, total: o.grand_total }));
      return {
        orders: { count: orders.n, spent: orders.spent, groupsOrdered: orders.groups, groupsTotal: s.classes.length },
        vouchers,
        cards: { total: cards.total, used: cards.used ?? 0, remaining: cards.remaining },
        recent,
      };
    });

    r.post("/api/admin/reset", async (req) => {
      const body = z
        .object({ orders: z.boolean(), vouchers: z.boolean(), cards: z.boolean() })
        .parse(req.body);
      tx(db, () => {
        if (body.orders) db.exec("DELETE FROM orders");
        if (body.vouchers) db.exec("UPDATE vouchers SET used_at = NULL, used_order_id = NULL");
        if (body.cards) db.exec("UPDATE cards SET balance = initial_balance");
      });
      return { ok: true };
    });

    // ---- orders
    const listOrders = () =>
      (db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all() as OrderRow[]).map((o) => ({
        id: o.id,
        createdAt: o.created_at,
        name: o.name,
        group: o.class_name,
        cardNumber: o.card_number,
        total: o.grand_total,
        codes: JSON.parse(o.codes) as string[],
        voidedAt: o.voided_at,
        payload: JSON.parse(o.payload),
      }));

    r.get("/api/admin/orders", async () => listOrders());

    r.post<{ Params: { id: string } }>("/api/admin/orders/:id/void", async (req) => {
      voidOrder(db, req.params.id);
      return { ok: true };
    });

    r.get("/api/admin/orders.csv", async (_req, reply) => {
      const orders = listOrders();
      const storeNames = [
        ...new Set(orders.flatMap((o) => (o.payload.perStoreTotals ?? []).map((s: { storeName?: string; storeId: string }) => s.storeName ?? s.storeId))),
      ] as string[];
      const header = [
        "Timestamp", "Name", "Group", "Grand Total", "Grand Total (before codes)", "Discount from Codes",
        "Discount Codes Used", "Items",
        ...[1, 2, 3].flatMap((k) => [`Justify ${k} — Item`, `Justify ${k} — Reason`]),
        ...storeNames.flatMap((n) => [`${n} — Subtotal (before discount)`, `${n} — Discount`, `${n} — Shipping`, `${n} — Store Total`]),
        "Gift Card Number", "Gift Balance (before)", "Gift Charge Amount", "Gift Balance (after)", "Voided",
      ];
      const rows = orders.map((o) => {
        const p = o.payload;
        const items = (p.items ?? []) as { storeName?: string; sku: string; name: string; qty: number; unitPrice: number; lineTotal: number }[];
        const od = p.overallDiscounts;
        const justs = (p.justifications ?? []) as { sku: string; text: string }[];
        const totals = (p.perStoreTotals ?? []) as { storeName?: string; storeId: string; itemsSubtotal: number; itemsDiscount: number; shippingNet: number; storeTotal: number }[];
        return [
          o.createdAt, o.name, o.group, o.total.toFixed(2),
          (od?.grandTotalBeforeDiscounts ?? o.total).toFixed(2),
          ((od?.percentDiscountAmount ?? 0) + (od?.absoluteDiscountAmount ?? 0)).toFixed(2),
          o.codes.join(" "),
          items.map((i) => `${i.storeName ?? ""} — ${i.name} x ${i.qty} @ S$${i.unitPrice.toFixed(2)} = S$${i.lineTotal.toFixed(2)}`).join("\n"),
          ...[0, 1, 2].flatMap((k) => {
            const j = justs[k];
            const it = j && items.find((i) => i.sku === j.sku);
            return j ? [it ? `${it.storeName} — ${it.name}` : j.sku, j.text] : ["", ""];
          }),
          ...storeNames.flatMap((n) => {
            const t = totals.find((s) => (s.storeName ?? s.storeId) === n);
            return t ? [t.itemsSubtotal.toFixed(2), t.itemsDiscount.toFixed(2), t.shippingNet.toFixed(2), t.storeTotal.toFixed(2)] : ["", "", "", ""];
          }),
          o.cardNumber,
          p.paymentInfo?.balanceBefore?.toFixed(2) ?? "",
          p.paymentInfo?.chargeAmount?.toFixed(2) ?? "",
          p.paymentInfo?.balanceAfter?.toFixed(2) ?? "",
          o.voidedAt ?? "",
        ];
      });
      return sendCsv(reply, "orders.csv", [header, ...rows]);
    });

    // ---- vouchers
    const listVouchers = () =>
      (
        db
          .prepare(
            `SELECT v.*, o.name AS used_by_name, o.class_name AS used_by_group
             FROM vouchers v LEFT JOIN orders o ON o.id = v.used_order_id
             ORDER BY v.kind DESC, v.amount, v.created_at, v.code`
          )
          .all() as {
          code: string; kind: "percent" | "absolute"; amount: number; description: string;
          used_at: string | null; used_order_id: string | null; created_at: string;
          used_by_name: string | null; used_by_group: string | null;
        }[]
      ).map((v) => ({
        code: v.code,
        kind: v.kind,
        amount: v.amount,
        description: v.description,
        createdAt: v.created_at,
        usedAt: v.used_at,
        usedBy: v.used_at ? { orderId: v.used_order_id, name: v.used_by_name, group: v.used_by_group } : null,
      }));

    r.get("/api/admin/vouchers", async () => listVouchers());

    r.post("/api/admin/vouchers", async (req) => {
      const b = z
        .object({
          code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9]+$/, "Letters and numbers only"),
          kind: voucherKind,
          amount: z.number().positive().max(100_000),
          description: z.string().trim().max(200).optional(),
        })
        .parse(req.body);
      const code = normaliseCode(b.code);
      if (db.prepare("SELECT 1 FROM vouchers WHERE code = ?").get(code)) {
        throw new ApiError(409, "EXISTS", `Code ${code} already exists`);
      }
      db.prepare("INSERT INTO vouchers (code, kind, amount, description, created_at) VALUES (?, ?, ?, ?, ?)").run(
        code, b.kind, b.amount, b.description || voucherDescription(b.kind, b.amount), nowIso()
      );
      return { ok: true };
    });

    r.post("/api/admin/vouchers/generate", async (req) => {
      const b = z
        .object({ kind: voucherKind, amount: z.number().positive().max(100_000), count: z.number().int().min(1).max(1000) })
        .parse(req.body);
      const taken = new Set((db.prepare("SELECT code FROM vouchers").all() as { code: string }[]).map((v) => v.code.toUpperCase()));
      const ins = db.prepare("INSERT INTO vouchers (code, kind, amount, description, created_at) VALUES (?, ?, ?, ?, ?)");
      const now = nowIso();
      tx(db, () => {
        for (let i = 0; i < b.count; i++) {
          ins.run(newVoucherCode(b.amount, taken), b.kind, b.amount, voucherDescription(b.kind, b.amount), now);
        }
      });
      return { ok: true, created: b.count };
    });

    r.post<{ Params: { code: string } }>("/api/admin/vouchers/:code/reset", async (req) => {
      db.prepare("UPDATE vouchers SET used_at = NULL, used_order_id = NULL WHERE code = ?").run(req.params.code);
      return { ok: true };
    });

    r.post("/api/admin/vouchers/delete", async (req) => {
      const { codes } = z.object({ codes: z.array(z.string()).min(1).max(5000) }).parse(req.body);
      const del = db.prepare("DELETE FROM vouchers WHERE code = ?");
      tx(db, () => codes.forEach((c) => del.run(c)));
      return { ok: true };
    });

    r.get("/api/admin/vouchers.csv", async (_req, reply) =>
      sendCsv(reply, "voucher-codes.csv", [
        ["amount", "code", "kind", "description", "used_at", "used_by_group", "used_by_name"],
        ...listVouchers().map((v) => [v.amount, v.code, v.kind, v.description, v.usedAt, v.usedBy?.group, v.usedBy?.name]),
      ])
    );

    // ---- gift cards
    const listCards = () =>
      (
        db
          .prepare(
            `SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE o.card_number = c.number AND o.voided_at IS NULL) AS orders
             FROM cards c`
          )
          .all() as { number: string; group_name: string; initial_balance: number; balance: number; created_at: string; orders: number }[]
      )
        .map((c) => ({
          number: c.number,
          group: c.group_name,
          initialBalance: c.initial_balance,
          balance: c.balance,
          orders: c.orders,
          createdAt: c.created_at,
        }))
        .sort((a, b) => {
          if (!a.group !== !b.group) return a.group ? -1 : 1;
          return a.group.localeCompare(b.group, undefined, { numeric: true }) || a.number.localeCompare(b.number);
        });

    r.get("/api/admin/cards", async () => listCards());

    r.post("/api/admin/cards", async (req) => {
      const b = z
        .object({
          number: z.string().trim().max(40).optional(),
          group: z.string().trim().max(50).default(""),
          balance: money,
        })
        .parse(req.body);
      const taken = new Set((db.prepare("SELECT number FROM cards").all() as { number: string }[]).map((c) => c.number));
      const number = b.number ? normaliseCardNumber(b.number) : newCardNumber(taken);
      if (!/^\d{6,24}$/.test(number)) throw new ApiError(400, "BAD_NUMBER", "Card numbers must be 6–24 digits");
      if (taken.has(number) && b.number) throw new ApiError(409, "EXISTS", "That card number already exists");
      db.prepare("INSERT INTO cards (number, group_name, initial_balance, balance, created_at) VALUES (?, ?, ?, ?, ?)").run(
        number, b.group, b.balance, b.balance, nowIso()
      );
      return { ok: true, number };
    });

    r.post("/api/admin/cards/generate", async (req) => {
      const b = z
        .object({ count: z.number().int().min(1).max(1000), balance: money, assignGroups: z.boolean() })
        .parse(req.body);
      const rows = db.prepare("SELECT number, group_name FROM cards").all() as { number: string; group_name: string }[];
      const taken = new Set(rows.map((c) => c.number));
      const hasCard = new Set(rows.map((c) => c.group_name).filter(Boolean));
      const freeGroups = b.assignGroups ? getSettings(db).classes.filter((g) => !hasCard.has(g)) : [];
      const ins = db.prepare("INSERT INTO cards (number, group_name, initial_balance, balance, created_at) VALUES (?, ?, ?, ?, ?)");
      const now = nowIso();
      tx(db, () => {
        for (let i = 0; i < b.count; i++) ins.run(newCardNumber(taken), freeGroups[i] ?? "", b.balance, b.balance, now);
      });
      return { ok: true, created: b.count, assigned: Math.min(b.count, freeGroups.length) };
    });

    r.patch<{ Params: { number: string } }>("/api/admin/cards/:number", async (req) => {
      const b = z
        .object({ group: z.string().trim().max(50), initialBalance: money, balance: money })
        .parse(req.body);
      const n = db
        .prepare("UPDATE cards SET group_name = ?, initial_balance = ?, balance = ? WHERE number = ?")
        .run(b.group, b.initialBalance, b.balance, req.params.number).changes;
      if (!n) throw new ApiError(404, "NOT_FOUND", "Card not found");
      return { ok: true };
    });

    r.post("/api/admin/cards/delete", async (req) => {
      const { numbers } = z.object({ numbers: z.array(z.string()).min(1).max(5000) }).parse(req.body);
      const del = db.prepare("DELETE FROM cards WHERE number = ?");
      tx(db, () => numbers.forEach((n) => del.run(n)));
      return { ok: true };
    });

    r.post("/api/admin/cards/set-budget", async (req) => {
      const { balance } = z.object({ balance: money }).parse(req.body);
      db.prepare("UPDATE cards SET initial_balance = ?, balance = ?").run(balance, balance);
      return { ok: true };
    });

    r.get("/api/admin/cards.csv", async (_req, reply) =>
      sendCsv(reply, "gift-cards.csv", [
        ["group", "card_number", "balance", "initial_balance", "orders"],
        ...listCards().map((c) => [c.group, c.number, c.balance.toFixed(2), c.initialBalance.toFixed(2), c.orders]),
      ])
    );

    // ---- stores & products
    r.get("/api/admin/stores", async () => listStores(db));

    r.post("/api/admin/stores", async (req) => {
      const b = z.object({ id: slug, name: z.string().trim().min(1).max(100) }).parse(req.body);
      if (db.prepare("SELECT 1 FROM stores WHERE id = ?").get(b.id)) {
        throw new ApiError(409, "EXISTS", `A store with id "${b.id}" already exists`);
      }
      insertStore(db, {
        id: b.id, name: b.name, cover: "", shippingBaseFee: 0, maxQtyPerItem: 3,
        showDiscountBreakdown: true, alerts: [], discounts: [],
      });
      return { ok: true };
    });

    r.put<{ Params: { id: string } }>("/api/admin/stores/:id", async (req) => {
      const b = storeBody.parse(req.body);
      if (!updateStore(db, req.params.id, b)) throw new ApiError(404, "NOT_FOUND", "Store not found");
      return { ok: true };
    });

    r.delete<{ Params: { id: string } }>("/api/admin/stores/:id", async (req) => {
      db.prepare("DELETE FROM stores WHERE id = ?").run(req.params.id);
      return { ok: true };
    });

    r.post("/api/admin/stores/reorder", async (req) => {
      const { ids } = z.object({ ids: z.array(z.string()).max(100) }).parse(req.body);
      const upd = db.prepare("UPDATE stores SET sort_order = ? WHERE id = ?");
      tx(db, () => ids.forEach((id, i) => upd.run(i, id)));
      return { ok: true };
    });

    r.post<{ Params: { id: string } }>("/api/admin/stores/:id/products", async (req) => {
      const b = productBody.parse(req.body);
      if (!db.prepare("SELECT 1 FROM stores WHERE id = ?").get(req.params.id)) {
        throw new ApiError(404, "NOT_FOUND", "Store not found");
      }
      if (db.prepare("SELECT 1 FROM products WHERE store_id = ? AND sku = ?").get(req.params.id, b.sku)) {
        throw new ApiError(409, "EXISTS", `This store already has a product with id "${b.sku}"`);
      }
      insertProduct(db, req.params.id, b);
      return { ok: true };
    });

    r.put<{ Params: { id: string; sku: string } }>("/api/admin/stores/:id/products/:sku", async (req) => {
      const b = productBody.parse(req.body);
      if (b.sku !== req.params.sku && db.prepare("SELECT 1 FROM products WHERE store_id = ? AND sku = ?").get(req.params.id, b.sku)) {
        throw new ApiError(409, "EXISTS", `This store already has a product with id "${b.sku}"`);
      }
      const n = db
        .prepare("UPDATE products SET sku = ?, name = ?, price = ?, img = ? WHERE store_id = ? AND sku = ?")
        .run(b.sku, b.name, b.price, b.img, req.params.id, req.params.sku).changes;
      if (!n) throw new ApiError(404, "NOT_FOUND", "Product not found");
      return { ok: true };
    });

    r.delete<{ Params: { id: string; sku: string } }>("/api/admin/stores/:id/products/:sku", async (req) => {
      db.prepare("DELETE FROM products WHERE store_id = ? AND sku = ?").run(req.params.id, req.params.sku);
      return { ok: true };
    });

    r.post<{ Params: { id: string } }>("/api/admin/stores/:id/products/reorder", async (req) => {
      const { skus } = z.object({ skus: z.array(z.string()).max(1000) }).parse(req.body);
      const upd = db.prepare("UPDATE products SET sort_order = ? WHERE store_id = ? AND sku = ?");
      tx(db, () => skus.forEach((sku, i) => upd.run(i, req.params.id, sku)));
      return { ok: true };
    });

    // ---- image upload (product photos, store covers)
    r.post("/api/admin/upload", async (req) => {
      const file = await req.file();
      if (!file) throw new ApiError(400, "NO_FILE", "No file uploaded");
      const ext = IMAGE_TYPES[file.mimetype];
      if (!ext) throw new ApiError(415, "BAD_TYPE", "Upload a PNG, JPEG, WebP or GIF image");
      mkdirSync(uploadsDir, { recursive: true });
      const name = `${randomBytes(12).toString("hex")}${ext}`;
      const dest = path.join(uploadsDir, name);
      await pipeline(file.file, createWriteStream(dest));
      if (file.file.truncated) {
        await unlink(dest).catch(() => {});
        throw new ApiError(413, "TOO_LARGE", "Images must be under 8 MB");
      }
      return { url: `/uploads/${name}` };
    });

    // ---- settings
    r.get("/api/admin/settings", async () => getSettings(db));

    r.put("/api/admin/settings", async (req) => {
      saveSettings(db, settingsBody.parse(req.body));
      return { ok: true };
    });

    // ---- printables (HTML pages that the browser prints)
    r.get<{ Querystring: { backups?: string } }>("/api/admin/printables/gift-cards", async (req, reply) => {
      reply.type("text/html; charset=utf-8");
      return giftCardsHtml(db, { backups: req.query.backups !== "0" });
    });

    r.get<{ Querystring: { unused?: string; amounts?: string } }>("/api/admin/printables/vouchers", async (req, reply) => {
      reply.type("text/html; charset=utf-8");
      return vouchersHtml(db, {
        unusedOnly: req.query.unused !== "0",
        amounts: req.query.amounts ? req.query.amounts.split(",").filter(Boolean) : null,
      });
    });
  });
}
