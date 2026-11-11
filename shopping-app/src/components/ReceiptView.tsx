// src/components/ReceiptView.tsx — one receipt layout for the student's
// receipt page and the admin's "View receipt" dialog.
//
// variant "page" is the student's /receipt page. variant "present" is the
// projector/shared-screen layout: a big header (group, name, time, total),
// larger type throughout and the justified picks given the most room.
import { useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Chip,
  Divider,
  Paper,
  Stack,
  ThemeProvider,
  Typography,
  createTheme,
  useTheme,
} from "@mui/material";
import ImageNotSupportedOutlinedIcon from "@mui/icons-material/ImageNotSupportedOutlined";
import { groupLabel, money } from "../lib/format";

// Everything but the buyer, the time and the total is optional, so orders
// saved by older versions of the shop still render.
export type ReceiptItem = {
  sku: string;
  name: string;
  img?: string;
  storeId?: string;
  storeName?: string;
  qty: number;
  unitPrice: number;
  originalLineTotal?: number;
  finalLineTotal?: number;
  discounts?: { label: string; amount: number }[];
};

export type ReceiptStoreTotals = {
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

export type ReceiptOverallDiscounts = {
  grandTotalBeforeDiscounts: number;
  grandTotalAfterDiscounts?: number;
  percentDiscountAmount: number;
  absoluteDiscountAmount: number;
  appliedCodes?: {
    code: string;
    kind: "percent" | "absolute";
    amount: number;
    description?: string;
  }[];
  capApplied?: boolean;
};

export type ReceiptData = {
  name: string;
  className: string;
  createdAt: string;
  grandTotal: number;
  justifications?: { sku: string; text: string }[];
  items?: ReceiptItem[];
  perStoreTotals?: ReceiptStoreTotals[];
  overallDiscounts?: ReceiptOverallDiscounts;
  breakdownSuppressed?: boolean;
};

type Props = {
  receipt: ReceiptData;
  variant?: "page" | "present";
  /** When set, a "Voided" banner goes above the receipt. */
  voidedAt?: string | null;
};

const lineTotal = (i: ReceiptItem) => i.finalLineTotal ?? i.qty * i.unitPrice;
const originalTotal = (i: ReceiptItem) => i.originalLineTotal ?? lineTotal(i);

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });


export default function ReceiptView({ receipt, variant = "page", voidedAt }: Props) {
  const outer = useTheme();
  // Present mode scales every Typography variant up via the theme's base size.
  const presentTheme = useMemo(
    () =>
      createTheme({
        palette: { mode: outer.palette.mode, primary: outer.palette.primary },
        shape: outer.shape,
        components: outer.components,
        typography: { fontSize: 18 },
      }),
    [outer]
  );
  if (variant !== "present") return <ReceiptBody receipt={receipt} variant={variant} voidedAt={voidedAt} />;
  return (
    <ThemeProvider theme={presentTheme}>
      {/* Wide screens (md and up) get a one-screen dashboard; phones, narrow
          windows and print keep the single column below. */}
      <Box
        className="cw-receipt-wide"
        sx={{ display: { xs: "none", md: "flex" }, height: "100%", "@media print": { display: "none !important" } }}
      >
        <ReceiptDashboard receipt={receipt} voidedAt={voidedAt} />
      </Box>
      <Box sx={{ display: { md: "none" }, "@media print": { display: "block !important" } }}>
        <ReceiptBody receipt={receipt} variant={variant} voidedAt={voidedAt} />
      </Box>
    </ThemeProvider>
  );
}

/** The receipt's lists, keyed for lookup: items by SKU and by store. */
function useReceiptParts(receipt: ReceiptData) {
  const items = useMemo(() => receipt.items ?? [], [receipt.items]);

  const bySku = useMemo(() => {
    const m: Record<string, ReceiptItem> = {};
    for (const it of items) if (!(it.sku in m)) m[it.sku] = it;
    return m;
  }, [items]);

  const itemsByStore = useMemo(() => {
    const m: Record<string, ReceiptItem[]> = {};
    for (const it of items) (m[it.storeName || it.storeId || "Store"] ??= []).push(it);
    return m;
  }, [items]);

  return {
    items,
    bySku,
    itemsByStore,
    justifications: receipt.justifications ?? [],
    perStoreTotals: receipt.perStoreTotals ?? [],
    overall: receipt.overallDiscounts,
    showBreakdown: !receipt.breakdownSuppressed,
  };
}

function ReceiptBody({ receipt, variant, voidedAt }: Required<Pick<Props, "variant">> & Props) {
  const present = variant === "present";
  const { items, bySku, itemsByStore, justifications, perStoreTotals, overall, showBreakdown } =
    useReceiptParts(receipt);

  const pad = present ? { xs: 2, sm: 3 } : 2;
  const thumb = present ? 80 : 64;

  return (
    <Stack spacing={3} className="cw-receipt">
      {voidedAt && (
        <Alert
          severity="error"
          variant="filled"
          sx={{ borderRadius: 2, fontSize: present ? "1.4rem" : undefined, fontWeight: 700 }}
        >
          Voided {dateTime(voidedAt)}. This order was cancelled and the gift card refunded.
        </Alert>
      )}

      {present ? (
        <PresentHeader receipt={receipt} />
      ) : (
        <>
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
                  <strong>Name:</strong> {receipt.name}
                </Typography>
                <Typography>
                  <strong>Group:</strong> {receipt.className}
                </Typography>
              </Box>
              <Chip label={"Created: " + dateTime(receipt.createdAt)} variant="outlined" />
            </Stack>
          </Paper>
        </>
      )}

      {receipt.breakdownSuppressed && (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          The discount calculation system for the store is down. The overall discounts are still
          accurate, but per-item and shipping breakdowns are hidden.
        </Alert>
      )}

      {/* Justifications (none → no section) */}
      {justifications.length > 0 && (
        <Paper sx={{ p: pad }}>
          <Typography variant={present ? "h5" : "h6"} fontWeight={present ? 800 : 700} gutterBottom>
            {present ? "Our justified picks" : "Your Justified Picks"}
          </Typography>

          <Stack
            spacing={present ? 2.5 : 1.5}
            sx={{
              "& > div": { borderBottom: "1px dashed", borderColor: "divider", pb: present ? 2.5 : 1.25 },
              "& > div:last-of-type": { borderBottom: "none", pb: 0 },
            }}
          >
            {justifications.map((j, idx) => {
              const ref = bySku[j.sku];
              const name = ref?.name || j.sku;
              return present ? (
                <Box
                  key={`${j.sku}-${idx}`}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "72px 1fr", sm: "120px 1fr auto" },
                    columnGap: { xs: 1.5, sm: 2.5 },
                    rowGap: 1.25,
                    alignItems: "start",
                    breakInside: "avoid",
                  }}
                >
                  <Box sx={{ gridRow: { sm: "span 2" } }}>
                    <Thumb src={ref?.img} alt={name} size={{ xs: 72, sm: 120 }} radius={2} lazy={false} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.25 }}>
                      {idx + 1}. {name}
                    </Typography>
                    {ref?.storeName && (
                      <Typography color="text.secondary" fontWeight={600}>
                        {ref.storeName}
                        {ref.qty > 1 ? ` · ${ref.qty} × ${money(ref.unitPrice)}` : ""}
                      </Typography>
                    )}
                    {ref && (
                      <Typography fontWeight={800} sx={{ display: { sm: "none" } }}>
                        {money(lineTotal(ref))}
                      </Typography>
                    )}
                  </Box>
                  <Typography
                    variant="h6"
                    fontWeight={800}
                    sx={{ display: { xs: "none", sm: "block" }, textAlign: "right", whiteSpace: "nowrap" }}
                  >
                    {ref ? money(lineTotal(ref)) : ""}
                  </Typography>
                  {/* the reason: what students read out, so it gets the full width on phones */}
                  <Typography
                    sx={{
                      gridColumn: { xs: "1 / -1", sm: "2 / -1" },
                      pl: 1.5,
                      borderLeft: "4px solid",
                      borderColor: "primary.main",
                      fontSize: "1.3rem",
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {j.text}
                  </Typography>
                </Box>
              ) : (
                <Box key={`${j.sku}-${idx}`} sx={{ display: "flex", gap: 1.25, alignItems: "flex-start" }}>
                  <Thumb src={ref?.img} alt={name} size={56} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
                      <Typography fontWeight={700} noWrap title={name}>
                        {name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }} noWrap>
                        {ref?.storeName ? `(${ref.storeName})` : ""}
                      </Typography>
                    </Stack>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, whiteSpace: "pre-wrap" }}>
                      {j.text}
                    </Typography>

                    {ref && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                        Cost of justified item(s): {money(lineTotal(ref))}
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
      <Paper sx={{ p: pad }}>
        <Typography variant={present ? "h5" : "h6"} fontWeight={present ? 800 : 700} gutterBottom>
          Items by Store
        </Typography>

        {items.length === 0 && <Typography color="text.secondary">No items recorded for this order.</Typography>}

        <Stack spacing={present ? 3 : 2}>
          {Object.entries(itemsByStore).map(([store, storeItems]) => (
            <Box key={store}>
              <Typography
                fontWeight={800}
                sx={{
                  mb: 1,
                  letterSpacing: 0.2,
                  ...(present && { pb: 0.5, borderBottom: "2px solid", borderColor: "text.primary" }),
                }}
                variant={present ? "h6" : "subtitle1"}
              >
                {store}
              </Typography>

              <Stack spacing={1}>
                {storeItems.map((i) => {
                  const final = lineTotal(i);
                  const original = originalTotal(i);
                  const hasDiscount = final < original;

                  return (
                    <Box
                      key={`${store}-${i.sku}`}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: `${thumb}px 1fr auto`,
                        alignItems: "center",
                        gap: present ? 2 : 1,
                        py: 1,
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        "&:last-of-type": { borderBottom: "none" },
                        breakInside: "avoid",
                      }}
                    >
                      <Thumb src={i.img} alt={i.name} size={thumb} lazy={!present} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap={!present} title={i.name} fontWeight={present ? 700 : 600}>
                          {i.name}
                        </Typography>

                        <Typography variant="body2" color="text.secondary">
                          {(i.qty ?? 0) + " × " + money(i.unitPrice ?? 0)}
                        </Typography>

                        {showBreakdown &&
                          (i.discounts ?? []).map((d, idx) => (
                            <Typography key={idx} variant="caption" color="success.main" sx={{ display: "block" }}>
                              − {d.label}: {money(d.amount ?? 0)}
                            </Typography>
                          ))}
                      </Box>

                      <Box sx={{ textAlign: "right", minWidth: present ? 0 : 120 }}>
                        {hasDiscount ? (
                          <Stack alignItems="flex-end">
                            <Typography sx={{ textDecoration: "line-through", opacity: 0.6 }}>
                              {money(original)}
                            </Typography>
                            <Typography fontWeight={700} color="success.main">
                              {money(final)}
                            </Typography>
                          </Stack>
                        ) : (
                          <Typography fontWeight={700}>{money(final)}</Typography>
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
        {perStoreTotals.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" fontWeight={700}>
              Store Totals
            </Typography>
            <Box
              className="cw-receipt-totals"
              sx={{
                mt: 1,
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: present ? { xs: "1fr", md: "1fr 1fr" } : "1fr",
              }}
            >
              {perStoreTotals.map((s) => (
                <Box
                  key={s.storeId}
                  sx={{ p: 1.25, borderRadius: 2, border: "1px solid", borderColor: "divider", breakInside: "avoid" }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5, gap: 1 }}>
                    <Typography fontWeight={700}>{s.storeName || s.storeId}</Typography>
                    <Typography fontWeight={800}>{money(s.storeTotal ?? 0)}</Typography>
                  </Box>

                  <Stack spacing={0.25}>
                    <Row label="Items subtotal" value={money(s.itemsSubtotal ?? 0)} />
                    <Row label="Items discounts" value={"- " + money(s.itemsDiscount ?? 0)} />
                    {showBreakdown && <Row label="Items net" value={money(s.itemsNet ?? 0)} />}
                    <Row label="GST" value={money(s.gst ?? 0)} />
                    {showBreakdown ? (
                      <>
                        <Row label="Shipping fees" value={money(s.shippingBase ?? 0)} />
                        {s.shippingDiscount > 0 && (
                          <Row label="Shipping discounts" value={"- " + money(s.shippingDiscount ?? 0)} />
                        )}
                      </>
                    ) : (
                      <Row label="Shipping" value={money(s.shippingNet ?? 0)} />
                    )}
                  </Stack>
                </Box>
              ))}
            </Box>
          </>
        )}

        {/* Overall discount summary right above Grand Total */}
        {overall && (
          <Box sx={{ breakInside: "avoid" }}>
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" fontWeight={700} gutterBottom>
              {present ? "Vouchers" : "Overall Discounts"}
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
                <Row label="Discount voucher" value={"- " + money(overall.absoluteDiscountAmount ?? 0)} />
              )}
              {overall.capApplied && (
                <Typography variant="body2" color="warning.main" sx={{ mt: 0.5 }}>
                  You have exceeded the maximum discount limit. Your overall discount has been capped.
                </Typography>
              )}
            </Stack>

            {(overall.appliedCodes ?? []).length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5 }}>
                  Applied codes
                </Typography>
                <Stack spacing={0.5}>
                  {overall.appliedCodes!.map((c) => (
                    <Typography key={c.code} variant="body2">
                      <strong>{c.code}</strong> —{" "}
                      {c.kind === "percent" ? `${c.amount}% off` : `${money(c.amount)} off`}
                      {c.description ? ` · ${c.description}` : ""}
                    </Typography>
                  ))}
                </Stack>
              </>
            )}
          </Box>
        )}

        {/* Final grand total (after codes) */}
        <Divider sx={{ my: 2, ...(present && { borderBottomWidth: 2, borderColor: "text.primary" }) }} />
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 2 }}>
          <Typography variant={present ? "h5" : "h6"} fontWeight={present ? 800 : undefined}>
            Grand Total
          </Typography>
          <Typography variant={present ? "h4" : "h6"} fontWeight={800}>
            {money(receipt.grandTotal ?? 0)}
          </Typography>
        </Box>
      </Paper>
    </Stack>
  );
}

function PresentHeader({ receipt }: { receipt: ReceiptData }) {
  return (
    <Paper
      sx={{
        p: { xs: 2, sm: 3 },
        bgcolor: "grey.900",
        color: "common.white",
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { sm: "flex-end" },
        justifyContent: "space-between",
        gap: 2,
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="overline" sx={{ opacity: 0.75, letterSpacing: 2 }}>
          Receipt
        </Typography>
        <Typography
          variant="h2"
          component="h2"
          fontWeight={900}
          sx={{ lineHeight: 1.05, fontSize: { xs: "2.6rem", sm: "3.75rem" }, overflowWrap: "anywhere" }}
        >
          {groupLabel(receipt.className)}
        </Typography>
        <Typography variant="h5" fontWeight={600} sx={{ mt: 0.5, overflowWrap: "anywhere" }}>
          {receipt.name}
        </Typography>
        <Typography sx={{ mt: 0.5, opacity: 0.8 }}>{dateTime(receipt.createdAt)}</Typography>
      </Box>
      <Box sx={{ textAlign: { sm: "right" }, flexShrink: 0 }}>
        <Typography variant="overline" sx={{ opacity: 0.75, letterSpacing: 2 }}>
          Grand total
        </Typography>
        <Typography variant="h3" fontWeight={900} sx={{ lineHeight: 1.1, fontSize: { xs: "2.2rem", sm: "3rem" } }}>
          {money(receipt.grandTotal ?? 0)}
        </Typography>
      </Box>
    </Paper>
  );
}

// ---- Wide-screen dashboard (present variant, md and up) ----
//
// The whole receipt on one screen for a PC or projector: a header strip, then
// justified picks | items by store | totals. Type and pictures scale with the
// viewport (the --rd-* sizes), so a busy order fits at 1366×768 and up; an
// order too big for that scrolls inside its own panel, never the whole dialog.

const fs = {
  base: "var(--rd-fs)",
  small: "var(--rd-fs-sm)",
  reason: "var(--rd-fs-reason)",
  heading: "var(--rd-fs-h)",
};

function ReceiptDashboard({ receipt, voidedAt }: { receipt: ReceiptData; voidedAt?: string | null }) {
  const { items, bySku, itemsByStore, justifications, perStoreTotals, overall, showBreakdown } =
    useReceiptParts(receipt);
  const storeTotal = (storeKey: string) =>
    perStoreTotals.find((s) => (s.storeName || s.storeId) === storeKey || s.storeId === storeKey);

  return (
    <Box
      sx={{
        "--rd-fs": "clamp(13px, min(1.85vh, 1.05vw), 24px)",
        "--rd-fs-sm": "clamp(12px, min(1.55vh, 0.9vw), 20px)",
        "--rd-fs-reason": "clamp(16px, min(2.1vh, 1.2vw), 28px)",
        "--rd-fs-h": "clamp(16px, min(2.5vh, 1.4vw), 32px)",
        "--rd-thumb": "clamp(30px, 5vh, 64px)",
        "--rd-jthumb": "clamp(56px, 11vh, 140px)",
        "--rd-gap": "clamp(8px, 1.5vh, 20px)",
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: "var(--rd-gap)",
        fontSize: fs.base,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {voidedAt && (
        <Alert severity="error" variant="filled" sx={{ borderRadius: 2, py: 0, fontSize: fs.heading, fontWeight: 700 }}>
          Voided {dateTime(voidedAt)}. This order was cancelled and the gift card refunded.
        </Alert>
      )}
      {receipt.breakdownSuppressed && (
        <Alert severity="warning" sx={{ borderRadius: 2, py: 0, fontSize: fs.small }}>
          The discount calculation system for the store is down. The overall discounts are still accurate, but
          per-item and shipping breakdowns are hidden.
        </Alert>
      )}

      {/* Header strip */}
      <Paper
        sx={{
          px: "calc(var(--rd-gap) * 1.5)",
          py: "var(--rd-gap)",
          bgcolor: "grey.900",
          color: "common.white",
          display: "grid",
          gridTemplateColumns: "minmax(0, auto) minmax(0, 1fr) auto",
          alignItems: "center",
          columnGap: "calc(var(--rd-gap) * 2.5)",
          flexShrink: 0,
        }}
      >
        <Typography
          component="h2"
          fontWeight={900}
          sx={{ fontSize: "clamp(32px, min(7vh, 4.2vw), 96px)", lineHeight: 1.05, overflowWrap: "anywhere" }}
        >
          {groupLabel(receipt.className)}
        </Typography>
        <Box sx={{ minWidth: 0, borderLeft: "2px solid", borderColor: "grey.700", pl: "calc(var(--rd-gap) * 2.5)" }}>
          <Typography fontWeight={700} sx={{ fontSize: "clamp(20px, min(3.4vh, 2vw), 46px)", lineHeight: 1.2, overflowWrap: "anywhere" }}>
            {receipt.name}
          </Typography>
          <Typography sx={{ fontSize: fs.base, opacity: 0.8 }}>{dateTime(receipt.createdAt)}</Typography>
        </Box>
        <Box sx={{ textAlign: "right" }}>
          <Typography sx={{ fontSize: fs.small, opacity: 0.75, letterSpacing: 2, textTransform: "uppercase", lineHeight: 1.4 }}>
            Grand total
          </Typography>
          <Typography fontWeight={900} sx={{ fontSize: "clamp(30px, min(6.2vh, 3.8vw), 84px)", lineHeight: 1.05, whiteSpace: "nowrap" }}>
            {money(receipt.grandTotal ?? 0)}
          </Typography>
        </Box>
      </Paper>

      {/* Panels */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns:
            justifications.length > 0
              ? "minmax(0, 1.7fr) minmax(0, 1.1fr) minmax(0, 0.8fr)"
              : "minmax(0, 1.9fr) minmax(0, 1fr)",
          gap: "var(--rd-gap)",
        }}
      >
        {justifications.length > 0 && (
          <DashPanel title="Our justified picks">
            <Stack sx={{ gap: "var(--rd-gap)" }}>
              {justifications.map((j, idx) => {
                const ref = bySku[j.sku];
                const name = ref?.name || j.sku;
                return (
                  <Box
                    key={`${j.sku}-${idx}`}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "var(--rd-jthumb) minmax(0, 1fr)",
                      columnGap: "var(--rd-gap)",
                      alignItems: "start",
                      "&:not(:last-of-type)": { pb: "var(--rd-gap)", borderBottom: "1px dashed", borderColor: "divider" },
                    }}
                  >
                    <Thumb src={ref?.img} alt={name} size="var(--rd-jthumb)" radius={1.5} lazy={false} />
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5 }}>
                        <Typography fontWeight={800} sx={{ fontSize: fs.heading, lineHeight: 1.25, flex: 1, minWidth: 0 }}>
                          {idx + 1}. {name}
                        </Typography>
                        {ref && (
                          <Typography fontWeight={800} sx={{ fontSize: fs.heading, lineHeight: 1.25, whiteSpace: "nowrap" }}>
                            {money(lineTotal(ref))}
                          </Typography>
                        )}
                      </Box>
                      {ref?.storeName && (
                        <Typography color="text.secondary" fontWeight={600} sx={{ fontSize: fs.small }}>
                          {ref.storeName}
                          {ref.qty > 1 ? ` · ${ref.qty} × ${money(ref.unitPrice)}` : ""}
                        </Typography>
                      )}
                      <Typography
                        sx={{
                          mt: 0.5,
                          pl: 1.25,
                          borderLeft: "4px solid",
                          borderColor: "primary.main",
                          fontSize: fs.reason,
                          lineHeight: 1.38,
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {j.text}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          </DashPanel>
        )}

        <DashPanel title="Items by store">
          {items.length === 0 && (
            <Typography color="text.secondary" sx={{ fontSize: fs.base }}>
              No items recorded for this order.
            </Typography>
          )}
          {/* without justifications this panel is wider: stores flow into two columns */}
          <Box
            sx={{
              columnCount: justifications.length > 0 ? 1 : 2,
              columnGap: "calc(var(--rd-gap) * 2)",
              "& > div": { breakInside: "avoid" },
              "& > div:not(:last-of-type)": { mb: "var(--rd-gap)" },
            }}
          >
            {Object.entries(itemsByStore).map(([store, storeItems]) => {
              const total = storeTotal(store);
              return (
                <Box key={store}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 1,
                      pb: 0.25,
                      borderBottom: "2px solid",
                      borderColor: "text.primary",
                    }}
                  >
                    <Typography fontWeight={800} sx={{ fontSize: fs.base }}>
                      {store}
                    </Typography>
                    {total && (
                      <Typography fontWeight={800} sx={{ fontSize: fs.base }}>
                        {money(total.storeTotal ?? 0)}
                      </Typography>
                    )}
                  </Box>
                  {storeItems.map((i) => {
                    const final = lineTotal(i);
                    const original = originalTotal(i);
                    return (
                      <Box
                        key={`${store}-${i.sku}`}
                        sx={{
                          display: "grid",
                          gridTemplateColumns: "var(--rd-thumb) minmax(0, 1fr) auto",
                          alignItems: "center",
                          columnGap: 1.25,
                          py: 0.5,
                          "&:not(:last-of-type)": { borderBottom: "1px solid", borderColor: "divider" },
                        }}
                      >
                        <Thumb src={i.img} alt={i.name} size="var(--rd-thumb)" lazy={false} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography fontWeight={700} noWrap title={i.name} sx={{ fontSize: fs.base, lineHeight: 1.3 }}>
                            {i.name}
                          </Typography>
                          <Typography color="text.secondary" sx={{ fontSize: fs.small, lineHeight: 1.3 }}>
                            {(i.qty ?? 0) + " × " + money(i.unitPrice ?? 0)}
                            {showBreakdown &&
                              (i.discounts ?? []).map((d, idx) => (
                                <Box key={idx} component="span" sx={{ color: "success.main", display: "block" }}>
                                  − {d.label}: {money(d.amount ?? 0)}
                                </Box>
                              ))}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: "right" }}>
                          {final < original && (
                            <Typography sx={{ fontSize: fs.small, textDecoration: "line-through", opacity: 0.6, lineHeight: 1.3 }}>
                              {money(original)}
                            </Typography>
                          )}
                          <Typography
                            fontWeight={700}
                            color={final < original ? "success.main" : undefined}
                            sx={{ fontSize: fs.base, lineHeight: 1.3 }}
                          >
                            {money(final)}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              );
            })}
          </Box>
        </DashPanel>

        <DashPanel title="Totals">
          <Stack sx={{ gap: "calc(var(--rd-gap) * 0.75)" }}>
            {perStoreTotals.map((s) => (
              <Box key={s.storeId} sx={{ p: "calc(var(--rd-gap) * 0.6)", borderRadius: 1.5, border: "1px solid", borderColor: "divider" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                  <Typography fontWeight={700} sx={{ fontSize: fs.base }}>
                    {s.storeName || s.storeId}
                  </Typography>
                  <Typography fontWeight={800} sx={{ fontSize: fs.base }}>
                    {money(s.storeTotal ?? 0)}
                  </Typography>
                </Box>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 1.5 }}>
                  <DashRow label="Items" value={money(s.itemsSubtotal ?? 0)} />
                  <DashRow label="Discounts" value={"- " + money(s.itemsDiscount ?? 0)} />
                  <DashRow label="GST" value={money(s.gst ?? 0)} />
                  <DashRow
                    label="Shipping"
                    value={
                      showBreakdown && (s.shippingBase ?? 0) > 0 && (s.shippingNet ?? 0) === 0
                        ? "Free"
                        : money(s.shippingNet ?? 0)
                    }
                  />
                </Box>
              </Box>
            ))}
          </Stack>

          {overall && (
            <Box sx={{ mt: "var(--rd-gap)" }}>
              <Typography fontWeight={800} sx={{ fontSize: fs.base, mb: 0.25 }}>
                Vouchers
              </Typography>
              <DashRow label="Total before vouchers" value={money(overall.grandTotalBeforeDiscounts ?? 0)} />
              {(overall.appliedCodes ?? []).map((c) => (
                <Typography key={c.code} sx={{ fontSize: fs.small }}>
                  <strong>{c.code}</strong> — {c.kind === "percent" ? `${c.amount}% off` : `${money(c.amount)} off`}
                </Typography>
              ))}
              {overall.percentDiscountAmount > 0 && (
                <DashRow label="Percentage vouchers" value={"- " + money(overall.percentDiscountAmount ?? 0)} />
              )}
              {overall.absoluteDiscountAmount > 0 && (
                <DashRow label="Dollar vouchers" value={"- " + money(overall.absoluteDiscountAmount ?? 0)} />
              )}
              {overall.capApplied && (
                <Typography color="warning.main" sx={{ fontSize: fs.small, mt: 0.25 }}>
                  The maximum discount limit was reached, so the overall discount was capped.
                </Typography>
              )}
            </Box>
          )}

          <Box
            sx={{
              mt: "auto",
              pt: "var(--rd-gap)",
              borderTop: "2px solid",
              borderColor: "text.primary",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 1,
              flexWrap: "wrap",
            }}
          >
            <Typography fontWeight={800} sx={{ fontSize: fs.heading }}>
              Grand total
            </Typography>
            <Typography fontWeight={900} sx={{ fontSize: "clamp(22px, min(4vh, 2.3vw), 52px)", lineHeight: 1.1 }}>
              {money(receipt.grandTotal ?? 0)}
            </Typography>
          </Box>
        </DashPanel>
      </Box>
    </Box>
  );
}

function DashPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper
      sx={{
        minHeight: 0,
        overflowY: "auto",
        p: "calc(var(--rd-gap) * 1.1)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Typography component="h3" fontWeight={800} sx={{ fontSize: fs.heading, mb: "calc(var(--rd-gap) * 0.6)", lineHeight: 1.2 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

function DashRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
      <Typography color="text.secondary" sx={{ fontSize: fs.small }}>
        {label}
      </Typography>
      <Typography fontWeight={600} sx={{ fontSize: fs.small, whiteSpace: "nowrap" }}>
        {value}
      </Typography>
    </Box>
  );
}

type ThumbSize = number | string | { xs: number; sm: number };

/** Product picture, or a placeholder when the order has none (or it fails to load). */
function Thumb({
  src,
  alt,
  size,
  radius = 1,
  lazy = true,
}: {
  src?: string;
  alt: string;
  size: ThumbSize;
  radius?: number;
  lazy?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const sx = { width: size, height: size, borderRadius: radius, bgcolor: "action.hover", flexShrink: 0 };
  if (!src || broken) {
    return (
      <Box sx={{ ...sx, display: "grid", placeItems: "center", color: "text.disabled" }} aria-label={alt}>
        <ImageNotSupportedOutlinedIcon />
      </Box>
    );
  }
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      loading={lazy ? "lazy" : "eager"}
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      sx={{ ...sx, objectFit: "cover" }}
    />
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography fontWeight={600} sx={{ whiteSpace: "nowrap" }}>
        {value}
      </Typography>
    </Box>
  );
}
