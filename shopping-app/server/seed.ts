// server/seed.ts — import the legacy JSON files into an empty database
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { nowIso, tx, type DB } from "./db";
import { insertProduct, insertStore, saveSettings } from "./catalog";
import type { Store } from "../src/lib/types";
import type { DiscountCode } from "../src/lib/quote";

type SeedIndex = {
  title?: string;
  gst?: number;
  classes?: string[];
  alerts?: { message: string; severity?: string; type?: string }[];
  discountCap?: { percentMax?: number; absoluteMax?: number };
  discountCodes?: DiscountCode[];
  stores?: { id: string; name: string; cover?: string }[];
  giftCardFrom?: string;
  giftCardValidUntil?: string;
};

type SeedCards = { cards: { number: string; balance: number; group?: string }[] };

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;

const severity = (s?: string) =>
  s === "success" || s === "warning" || s === "error" ? s : "info";

/** Returns a short description of what was imported, or null if skipped. */
export function seedIfEmpty(db: DB, seedDir: string): string | null {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM stores").get() as { n: number };
  const { s } = db.prepare("SELECT COUNT(*) AS s FROM settings").get() as { s: number };
  if (n > 0 || s > 0) return null;

  const indexFile = path.join(seedDir, "index.json");
  if (!existsSync(indexFile)) return null;
  const index = readJson<SeedIndex>(indexFile);

  return tx(db, () => {
    saveSettings(db, {
      title: index.title ?? "School Cart",
      gst: typeof index.gst === "number" ? index.gst : 0.09,
      classes: index.classes ?? [],
      // older index.json files used "type" instead of "severity"
      alerts: (index.alerts ?? []).map((a) => ({
        message: a.message.trim(),
        severity: severity(a.severity ?? a.type),
      })),
      discountCap: index.discountCap ?? null,
      giftCardFrom: index.giftCardFrom ?? "",
      giftCardValidUntil: index.giftCardValidUntil ?? "",
    });

    let products = 0;
    (index.stores ?? []).forEach((entry, i) => {
      const file = path.join(seedDir, `${entry.id}.json`);
      const store: Partial<Store> = existsSync(file) ? readJson<Store>(file) : {};
      insertStore(
        db,
        {
          id: entry.id,
          name: store.name ?? entry.name,
          cover: entry.cover ?? "",
          shippingBaseFee: store.shipping?.baseFee ?? 0,
          maxQtyPerItem: store.constraints?.maxQtyPerItem ?? 3,
          showDiscountBreakdown: store.showDiscountBreakdown !== false,
          alerts: store.alerts ?? [],
          discounts: store.discounts ?? [],
        },
        i
      );
      (store.products ?? []).forEach((p, j) => {
        insertProduct(db, entry.id, p, j);
        products++;
      });
    });

    const now = nowIso();
    const insV = db.prepare(
      "INSERT OR IGNORE INTO vouchers (code, kind, amount, description, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    for (const c of index.discountCodes ?? []) {
      insV.run(c.code.toUpperCase(), c.kind, c.amount, c.description ?? "", now);
    }

    let cardCount = 0;
    const cardsFile = path.join(seedDir, "cards.json");
    if (existsSync(cardsFile)) {
      const insC = db.prepare(
        "INSERT OR IGNORE INTO cards (number, group_name, initial_balance, balance, created_at) VALUES (?, ?, ?, ?, ?)"
      );
      for (const c of readJson<SeedCards>(cardsFile).cards ?? []) {
        insC.run(String(c.number), c.group ?? "", c.balance, c.balance, now);
        cardCount++;
      }
    }

    return `${index.stores?.length ?? 0} stores, ${products} products, ${
      index.discountCodes?.length ?? 0
    } vouchers, ${cardCount} gift cards`;
  });
}
