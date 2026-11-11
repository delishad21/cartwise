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
  const body = <ReceiptBody receipt={receipt} variant={variant} voidedAt={voidedAt} />;
  return variant === "present" ? <ThemeProvider theme={presentTheme}>{body}</ThemeProvider> : body;
}

function ReceiptBody({ receipt, variant, voidedAt }: Required<Pick<Props, "variant">> & Props) {
  const present = variant === "present";
  const items = useMemo(() => receipt.items ?? [], [receipt.items]);
  const justifications = receipt.justifications ?? [];
  const perStoreTotals = receipt.perStoreTotals ?? [];
  const overall = receipt.overallDiscounts;
  const showBreakdown = !receipt.breakdownSuppressed;

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
                    <Thumb src={ref?.img} alt={name} size={{ xs: 72, sm: 120 }} radius={2} />
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
                      <Thumb src={i.img} alt={i.name} size={thumb} />
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

type ThumbSize = number | { xs: number; sm: number };

/** Product picture, or a placeholder when the order has none (or it fails to load). */
function Thumb({ src, alt, size, radius = 1 }: { src?: string; alt: string; size: ThumbSize; radius?: number }) {
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
      loading="lazy"
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
