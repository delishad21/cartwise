// src/lib/useStores.ts
import { useEffect, useMemo, useState } from "react";
import type { Store } from "./types";
import type { DiscountCap } from "./quote";

export type StoreListItem = { id: string; name: string; cover?: string };

export type SiteAlert = {
  message: string;
  severity?: "info" | "success" | "warning" | "error";
};

type SiteInfo = {
  title?: string;
  gst?: number;
  classes?: string[];
  alerts?: SiteAlert[];
  stores?: StoreListItem[];
  discountCap?: DiscountCap | null;
};

export function useStoresList() {
  const [stores, setStores] = useState<StoreListItem[]>([]);
  const [siteTitle, setSiteTitle] = useState("School Cart");
  const [classes, setClasses] = useState<string[]>([]);
  const [gstRate, setGstRate] = useState(0.09);
  const [siteAlerts, setSiteAlerts] = useState<SiteAlert[]>([]);
  const [discountCap, setDiscountCap] = useState<DiscountCap | null>(null);

  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/site", { signal: ac.signal });
        if (!res.ok) throw new Error(`Failed to load site (${res.status})`);
        const json: SiteInfo = await res.json();

        setStores(json.stores ?? []);
        setSiteTitle(json.title ?? "School Cart");
        setClasses(json.classes ?? []);
        setGstRate(typeof json.gst === "number" ? json.gst : 0.09);
        setSiteAlerts(Array.isArray(json.alerts) ? json.alerts : []);
        setDiscountCap(json.discountCap ?? null);
      } catch (e) {
        if ((e as any)?.name !== "AbortError") {
          console.error(e);
          setStores([]);
          setSiteTitle("School Cart");
          setClasses([]);
          setGstRate(0.09);
          setSiteAlerts([]);
          setDiscountCap(null);
        }
      }
    })();

    return () => ac.abort();
  }, []);

  return {
    stores,
    siteTitle,
    classes,
    gstRate,
    siteAlerts,
    discountCap,
  };
}

export function useStore(id?: string) {
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();

    setLoading(true);
    setError(undefined);
    setStore(null);

    (async () => {
      try {
        const res = await fetch(`/api/stores/${encodeURIComponent(id)}`, {
          signal: ac.signal,
        });
        if (!res.ok) {
          setError(`Store "${id}" not found (HTTP ${res.status})`);
          setLoading(false);
          return;
        }
        const json = (await res.json()) as Store;
        setStore(json);
        setLoading(false);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          setError(e?.message || "Failed to load store");
          setLoading(false);
        }
      }
    })();

    return () => ac.abort();
  }, [id]);

  const productsBySku = useMemo(() => {
    const map: Record<string, Store["products"][number]> = {};
    if (store) for (const p of store.products) map[p.sku] = p;
    return map;
  }, [store]);

  return { store, productsBySku, loading, error };
}
