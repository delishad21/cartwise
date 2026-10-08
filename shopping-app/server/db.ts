// server/db.ts
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stores (
  id                      TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  cover                   TEXT NOT NULL DEFAULT '',
  sort_order              INTEGER NOT NULL DEFAULT 0,
  shipping_base_fee       REAL NOT NULL DEFAULT 0,
  max_qty_per_item        INTEGER NOT NULL DEFAULT 3,
  show_discount_breakdown INTEGER NOT NULL DEFAULT 1,
  alerts                  TEXT NOT NULL DEFAULT '[]',
  discounts               TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS products (
  store_id   TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  sku        TEXT NOT NULL,
  name       TEXT NOT NULL,
  price      REAL NOT NULL,
  img        TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, sku)
);
CREATE TABLE IF NOT EXISTS vouchers (
  code          TEXT PRIMARY KEY COLLATE NOCASE,
  kind          TEXT NOT NULL CHECK (kind IN ('percent', 'absolute')),
  amount        REAL NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  used_at       TEXT,
  used_order_id TEXT,
  created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
  number          TEXT PRIMARY KEY,
  group_name      TEXT NOT NULL DEFAULT '',
  initial_balance REAL NOT NULL,
  balance         REAL NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  name        TEXT NOT NULL,
  class_name  TEXT NOT NULL,
  card_number TEXT NOT NULL,
  grand_total REAL NOT NULL,
  codes       TEXT NOT NULL DEFAULT '[]',
  payload     TEXT NOT NULL,
  voided_at   TEXT
);
CREATE INDEX IF NOT EXISTS orders_created_at ON orders (created_at);
`;

export function openDb(dataDir: string): DB {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "shop.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

/**
 * Run fn inside a write transaction. node:sqlite is synchronous, so as long as
 * fn doesn't await, nothing else can interleave with it.
 */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const nowIso = () => new Date().toISOString();
