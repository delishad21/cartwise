// src/admin/api.ts — tiny fetch wrapper for /api/admin
import { useCallback, useEffect, useState } from "react";
import type { Product, StoreAlert, DiscountRule } from "../lib/types";
import type { DiscountCap, OrderQuote } from "../lib/quote";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Fired when any call comes back 401, so the shell can show the login screen. */
export const UNAUTHORISED_EVENT = "admin:unauthorised";

export async function api<T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !url.endsWith("/login")) {
      window.dispatchEvent(new Event(UNAUTHORISED_EVENT));
    }
    throw new ApiError(res.status, data?.error ?? "ERROR", data?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/admin/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "ERROR", data?.message ?? "Upload failed");
  return (data as { url: string }).url;
}

/** Load a GET endpoint; optionally poll it every `pollMs`. */
export function useApi<T>(url: string, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await api<T>("GET", url));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [url]);

  useEffect(() => {
    reload();
    if (!pollMs) return;
    const t = setInterval(reload, pollMs);
    return () => clearInterval(t);
  }, [reload, pollMs]);

  return { data, error, reload };
}

// ---------------------------------------------------------------- types

export type Overview = {
  orders: { count: number; spent: number; groupsOrdered: number; groupsTotal: number };
  vouchers: { kind: "percent" | "absolute"; amount: number; total: number; used: number }[];
  cards: { total: number; used: number; remaining: number };
  recent: { id: string; createdAt: string; name: string; group: string; total: number }[];
};

export type OrderPayload = OrderQuote & {
  orderId: string;
  name: string;
  className: string;
  justifications: { sku: string; text: string }[];
  paymentInfo: { giftCardNumber: string; balanceBefore: number; chargeAmount: number; balanceAfter: number };
  createdAt: string;
};

export type AdminOrder = {
  id: string;
  createdAt: string;
  name: string;
  group: string;
  cardNumber: string;
  total: number;
  codes: string[];
  voidedAt: string | null;
  payload: OrderPayload;
};

export type AdminVoucher = {
  code: string;
  kind: "percent" | "absolute";
  amount: number;
  description: string;
  createdAt: string;
  usedAt: string | null;
  usedBy: { orderId: string | null; name: string | null; group: string | null } | null;
};

export type AdminCard = {
  number: string;
  group: string;
  initialBalance: number;
  balance: number;
  orders: number;
  createdAt: string;
};

export type AdminStore = {
  id: string;
  name: string;
  cover: string;
  sortOrder: number;
  alerts: StoreAlert[];
  shipping: { baseFee: number };
  constraints: { maxQtyPerItem: number };
  discounts: DiscountRule[];
  products: Product[];
  showDiscountBreakdown: boolean;
};

export type Settings = {
  title: string;
  gst: number;
  classes: string[];
  alerts: StoreAlert[];
  discountCap: DiscountCap | null;
  giftCardFrom: string;
  giftCardValidUntil: string;
};

export const voucherLabel = (v: { kind: "percent" | "absolute"; amount: number }) =>
  v.kind === "percent" ? `${v.amount}% off` : `S$${v.amount} off`;

export const spacedCard = (n: string) => n.replace(/(\d{4})(?=\d)/g, "$1 ");

export const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
