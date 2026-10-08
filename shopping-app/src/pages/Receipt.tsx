import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { money } from "../lib/format";

type ItemDiscount = { label: string; amount: number };

type ItemPayload = {
  sku: string;
  name: string;
  img?: string;
  storeName?: string;
  qty: number;
  unitPrice: number;
  originalLineTotal: number;
  finalLineTotal: number;
  discounts: ItemDiscount[];
};

type StoreTotalsPayload = {
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

type OverallDiscountsPayload = {
  grandTotalBeforeDiscounts: number;
  grandTotalAfterDiscounts: number;
  percentDiscountAmount: number;
  absoluteDiscountAmount: number;
  appliedCodes: {
    code: string;
    kind: "percent" | "absolute";
    amount: number;
    description?: string;
  }[];
  capApplied?: boolean;
  configuredCap?: {
    absoluteMax?: number | null;
    percentMax?: number | null;
  } | null;
};

type Payload = {
  name: string;
  className: string;
  justifications: { sku: string; text: string }[];
  items: ItemPayload[];
  perStoreTotals: StoreTotalsPayload[];
  overallDiscounts?: OverallDiscountsPayload;
  grandTotal: number;
  createdAt: string;
  breakdownSuppressed?: boolean;
};

export default function Receipt() {
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("last-order");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Payload;
        setPayload(parsed);
      } catch {
        // ignore
      }
      localStorage.removeItem("last-order");
    }
  }, []);

  const bySku = useMemo(() => {
    const m: Record<string, ItemPayload> = {};
    if (!payload) return m;
    for (const it of payload.items) {
      if (!(it.sku in m)) m[it.sku] = it;
    }
    return m;
  }, [payload]);

  const itemsByStore = useMemo(() => {
    const m: Record<string, ItemPayload[]> = {};
    if (!payload) return m;
    for (const it of payload.items) {
      const k = it.storeName || "Store";
      (m[k] ??= []).push(it);
    }
    return m;
  }, [payload]);

  if (!payload) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={700}>
          No recent order found
        </Typography>
        <Typography color="text.secondary">
          Make a purchase to see a receipt here.
        </Typography>
      </Paper>
    );
  }

  const overall = payload.overallDiscounts;

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={800}>
        Receipt
      </Typography>

      {/* Buyer summary */}
      <Paper sx={{ p: 2 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.25}
          alignItems={{ sm: "center" }}
          justifyContent="space-between"
        >
          <Box>
            <Typography>
              <strong>Name:</strong> {payload.name}
            </Typography>
            <Typography>
              <strong>Group:</strong> {payload.className}
            </Typography>
          </Box>
          <Chip
            label={
              "Created: " +
              new Date(payload.createdAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })
            }
            variant="outlined"
          />
        </Stack>
      </Paper>

      {payload.breakdownSuppressed && (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          The discount calculation system for the store is down. The overall
          discounts are still accurate, but per-item and shipping breakdowns are
          hidden.
        </Alert>
      )}

      {/* Justifications */}
      {payload.justifications.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Your Justified Picks
          </Typography>

          <Stack
            spacing={1.5}
            sx={{
              "& > div": {
                borderBottom: "1px dashed",
                borderColor: "divider",
                pb: 1.25,
              },
              "& > div:last-of-type": { borderBottom: "none", pb: 0 },
            }}
          >
            {payload.justifications.map((j, idx) => {
              const ref = bySku[j.sku];
              const finalCost = ref?.finalLineTotal ?? 0;
              return (
                <Box
                  key={`${j.sku}-${idx}`}
                  sx={{ display: "flex", gap: 1.25, alignItems: "flex-start" }}
                >
                  <Avatar
                    variant="rounded"
                    src={ref?.img}
                    alt={ref?.name || j.sku}
                    sx={{ width: 56, height: 56, bgcolor: "action.hover" }}
                  />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="baseline"
                      flexWrap="wrap"
                    >
                      <Typography
                        fontWeight={700}
                        noWrap
                        title={ref?.name || j.sku}
                      >
                        {ref?.name || j.sku}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ ml: 0.5 }}
                        noWrap
                      >
                        {ref?.storeName ? `(${ref.storeName})` : ""}
                      </Typography>
                    </Stack>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 0.25, whiteSpace: "pre-wrap" }}
                    >
                      {j.text}
                    </Typography>

                    {ref && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", mt: 0.5 }}
                      >
                        Cost of justified item(s): {money(finalCost)}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}

      {/* Items grouped by store + totals + overall discounts + grand total */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          Items by Store
        </Typography>

        <Stack spacing={2}>
          {Object.entries(itemsByStore).map(([store, items]) => (
            <Box key={store}>
              <Typography
                fontWeight={800}
                sx={{ mb: 1, letterSpacing: 0.2 }}
                variant="subtitle1"
              >
                {store}
              </Typography>

              <Stack spacing={1}>
                {items.map((i) => {
                  const hasDiscount = i.finalLineTotal < i.originalLineTotal;
                  const showBreakdown = !payload.breakdownSuppressed;

                  return (
                    <Box
                      key={`${store}-${i.sku}`}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "64px 1fr auto",
                        alignItems: "center",
                        gap: 1,
                        py: 1,
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        "&:last-of-type": { borderBottom: "none" },
                      }}
                    >
                      <Box
                        component="img"
                        src={i.img}
                        alt={i.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        sx={{
                          width: 64,
                          height: 64,
                          borderRadius: 1,
                          objectFit: "cover",
                          bgcolor: "action.hover",
                        }}
                      />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap title={i.name} fontWeight={600}>
                          {i.name}
                        </Typography>

                        <Typography variant="body2" color="text.secondary">
                          {(i.qty ?? 0) + " × " + money(i.unitPrice ?? 0)}
                        </Typography>

                        {showBreakdown &&
                          i.discounts.map((d, idx) => (
                            <Typography
                              key={idx}
                              variant="caption"
                              color="success.main"
                              sx={{ display: "block" }}
                            >
                              − {d.label}: {money(d.amount ?? 0)}
                            </Typography>
                          ))}
                      </Box>

                      <Box sx={{ textAlign: "right", minWidth: 120 }}>
                        {hasDiscount ? (
                          <Stack alignItems="flex-end">
                            <Typography
                              sx={{
                                textDecoration: "line-through",
                                opacity: 0.6,
                              }}
                            >
                              {money(i.originalLineTotal ?? 0)}
                            </Typography>
                            <Typography fontWeight={700} color="success.main">
                              {money(i.finalLineTotal ?? 0)}
                            </Typography>
                          </Stack>
                        ) : (
                          <Typography fontWeight={700}>
                            {money(i.finalLineTotal ?? 0)}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>

        {/* Store totals + shipping breakdown */}
        {payload.perStoreTotals.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" fontWeight={700}>
              Store Totals
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              {payload.perStoreTotals.map((s) => {
                const showBreakdown = !payload.breakdownSuppressed;
                return (
                  <Box
                    key={s.storeId}
                    sx={{
                      p: 1.25,
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        mb: 0.5,
                      }}
                    >
                      <Typography fontWeight={700}>
                        {s.storeName || s.storeId}
                      </Typography>
                      <Typography fontWeight={800}>
                        {money(s.storeTotal ?? 0)}
                      </Typography>
                    </Box>

                    <Stack spacing={0.25}>
                      <Row
                        label="Items subtotal"
                        value={money(s.itemsSubtotal ?? 0)}
                      />
                      <Row
                        label="Items discounts"
                        value={"- " + money(s.itemsDiscount ?? 0)}
                      />
                      {showBreakdown && (
                        <Row label="Items net" value={money(s.itemsNet ?? 0)} />
                      )}
                      <Row label="GST" value={money(s.gst ?? 0)} />
                      {showBreakdown ? (
                        <>
                          <Row
                            label="Shipping fees"
                            value={money(s.shippingBase ?? 0)}
                          />
                          {s.shippingDiscount > 0 && (
                            <Row
                              label="Shipping discounts"
                              value={"- " + money(s.shippingDiscount ?? 0)}
                            />
                          )}
                          {/* <Row
                            label="Shipping net"
                            value={money(s.shippingNet ?? 0)}
                          /> */}
                        </>
                      ) : (
                        <Row
                          label="Shipping"
                          value={money(s.shippingNet ?? 0)}
                        />
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </>
        )}

        {/* Overall discount summary right above Grand Total */}
        {overall && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Overall Discounts
            </Typography>

            <Stack spacing={0.5}>
              <Row
                label="Grand total before discount vouchers"
                value={money(overall.grandTotalBeforeDiscounts ?? 0)}
              />
              {overall.percentDiscountAmount > 0 && (
                <Row
                  label="Discount voucher percentage discounts"
                  value={"- " + money(overall.percentDiscountAmount ?? 0)}
                />
              )}
              {overall.absoluteDiscountAmount > 0 && (
                <Row
                  label="Discount voucher"
                  value={"- " + money(overall.absoluteDiscountAmount ?? 0)}
                />
              )}
              {overall.capApplied && (
                <Typography
                  variant="body2"
                  color="warning.main"
                  sx={{ mt: 0.5 }}
                >
                  You have exceeded the maximum discount limit. Your overall
                  discount has been capped.
                </Typography>
              )}
            </Stack>

            {overall.appliedCodes.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5 }}>
                  Applied codes
                </Typography>
                <Stack spacing={0.5}>
                  {overall.appliedCodes.map((c) => (
                    <Typography key={c.code} variant="body2">
                      <strong>{c.code}</strong> —{" "}
                      {c.kind === "percent"
                        ? `${c.amount}% off`
                        : `${money(c.amount)} off`}
                      {c.description ? ` · ${c.description}` : ""}
                    </Typography>
                  ))}
                </Stack>
              </>
            )}
          </>
        )}

        {/* Final grand total (after codes) */}
        <Divider sx={{ my: 2 }} />
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography variant="h6">Grand Total</Typography>
          <Typography variant="h6" fontWeight={800}>
            {money(payload.grandTotal ?? 0)}
          </Typography>
        </Box>
      </Paper>
    </Stack>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography fontWeight={600}>{value}</Typography>
    </Box>
  );
}
