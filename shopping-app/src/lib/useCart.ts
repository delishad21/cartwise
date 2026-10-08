// src/lib/useCart.ts
import { create } from "zustand";

// Cart is in-memory only so shared devices don't carry over a previous
// user's cart. Clear the cart that older versions persisted.
try {
  localStorage.removeItem("school-cart");
} catch {
  // storage unavailable (e.g. private mode) — nothing to clear
}

type Lines = Record<string, Record<string, number>>;

interface State {
  lines: Lines;
  add: (storeId: string, sku: string, qty?: number) => void;
  setQty: (storeId: string, sku: string, qty: number) => void;
  remove: (storeId: string, sku: string) => void;
  clearStore: (storeId: string) => void;
  clear: () => void;
}

function setStoreQtyImmutable(
  prev: Lines,
  storeId: string,
  sku: string,
  qty: number
): Lines {
  const prevStore = prev[storeId] || undefined;

  if (!prevStore && qty <= 0) return prev;

  const nextStore = { ...(prevStore || {}) };

  if (qty <= 0) {
    if (sku in nextStore) {
      delete nextStore[sku];
    } else {
      return prev;
    }
  } else {
    if (nextStore[sku] === qty) return prev;
    nextStore[sku] = qty;
  }

  if (Object.keys(nextStore).length === 0) {
    if (!(storeId in prev)) return prev;
    const next: Lines = { ...prev };
    delete next[storeId];
    return next;
  }

  if (prevStore && shallowEqualObject(prevStore, nextStore)) return prev;
  return { ...prev, [storeId]: nextStore };
}

function shallowEqualObject(
  a: Record<string, any> | undefined,
  b: Record<string, any>
) {
  if (!a) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export const useCart = create<State>()((set, get) => ({
  lines: {},

  add: (storeId, sku, qty = 1) => {
    const prev = get().lines;
    const curQty = prev[storeId]?.[sku] ?? 0;
    const nextQty = curQty + qty;
    if (nextQty === curQty) return;
    const next = setStoreQtyImmutable(prev, storeId, sku, nextQty);
    if (next !== prev) set({ lines: next });
  },

  setQty: (storeId, sku, qty) => {
    const prev = get().lines;
    const curQty = prev[storeId]?.[sku];
    if (curQty === qty) return;
    const next = setStoreQtyImmutable(prev, storeId, sku, qty);
    if (next !== prev) set({ lines: next });
  },

  remove: (storeId, sku) => {
    const prev = get().lines;
    if (!prev[storeId] || !(sku in prev[storeId])) return;
    const next = setStoreQtyImmutable(prev, storeId, sku, 0);
    if (next !== prev) set({ lines: next });
  },

  clearStore: (storeId) => {
    const prev = get().lines;
    if (!prev[storeId]) return;
    const next: Lines = { ...prev };
    delete next[storeId];
    set({ lines: next });
  },

  clear: () => {
    const prev = get().lines;
    if (Object.keys(prev).length === 0) return;
    set({ lines: {} });
  },
}));

const EMPTY_OBJ: Readonly<Record<string, number>> = Object.freeze({});

export const useCartForStore = (storeId?: string) => {
  const lines = useCart((s) =>
    storeId ? s.lines[storeId] ?? EMPTY_OBJ : EMPTY_OBJ
  );
  const totalQty = Object.values(lines).reduce((a, b) => a + b, 0);
  return { lines, totalQty };
};

export const useCartTotals = () => {
  const lines = useCart((s) => s.lines);
  const totalQty = Object.values(lines)
    .flatMap((o) => Object.values(o))
    .reduce((a, b) => a + b, 0);
  return { lines, totalQty };
};
