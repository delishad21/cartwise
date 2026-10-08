// src/pages/Checkout.tsx
import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Paper,
  Stack,
  Typography,
  TextField,
  Chip,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

import { useCart } from "../lib/useCart";
import { money } from "../lib/format";
import StoreCartCard from "../components/StoreCartCard";
import type { CalcEntry } from "../lib/types";
import CheckoutFormDialog, {
  type CheckoutFormValues,
} from "../components/CheckoutFormDialog";
import { useStoresList } from "../lib/useStores";
import {
  applyDiscountCodes,
  normaliseCode,
  type DiscountCode,
} from "../lib/quote";
import PaymentDialog from "../components/PaymentDialog";

export default function Checkout() {
  const { lines, clear } = useCart();
  const clearStore = useCart((s) => s.clearStore);
  const { classes, discountCap } = useStoresList();
  const nav = useNavigate();

  // ----- Cart --> per-store pricing -----
  const nonEmptyStoreIds = useMemo(
    () =>
      Object.entries(lines)
        .filter(([, skus]) => Object.values(skus).some((q) => q > 0))
        .map(([id]) => id)
        .sort(),
    [lines]
  );

  const [calcByStore, setCalcByStore] = useState<Record<string, CalcEntry>>({});

  const upsertCalc = (storeId: string, entry: CalcEntry | null) => {
    setCalcByStore((prev) => {
      if (!entry || entry.items.length === 0) {
        if (!(storeId in prev)) return prev;
        const next = { ...prev };
        delete next[storeId];
        return next;
      }
      const prevEntry = prev[storeId];
      if (prevEntry && JSON.stringify(prevEntry) === JSON.stringify(entry)) {
        return prev;
      }
      return { ...prev, [storeId]: entry };
    });
  };

  // Grand total before overall discount codes
  const grandTotalRaw = Object.values(calcByStore).reduce(
    (a, s) => a + s.totals.storeTotal,
    0
  );

  const richItems = useMemo(
    () =>
      Object.values(calcByStore).flatMap((entry) =>
        (entry.totals.perItem ?? []).map((pi) => ({
          storeId: entry.store.id,
          storeName: entry.store.name,
          sku: pi.sku,
          name: pi.name,
          img: pi.img,
          qty: pi.qty,
          unitPrice: pi.unitPrice,
          originalLineTotal: pi.originalLineTotal,
          finalLineTotal: pi.finalLineTotal,
          discounts: pi.discounts ?? [],
          lineTotal: pi.finalLineTotal,
        }))
      ),
    [calcByStore]
  );

  // ----- Overall discount codes (checked against the server) -----
  const [codeInput, setCodeInput] = useState("");
  const [appliedCodeObjects, setAppliedCodeObjects] = useState<DiscountCode[]>(
    []
  );
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);

  const handleApplyCode = async () => {
    const raw = normaliseCode(codeInput);
    if (!raw) {
      setCodeError("Enter a discount code");
      return;
    }
    if (appliedCodeObjects.some((c) => c.code === raw)) {
      setCodeError("Code already applied");
      return;
    }

    setCheckingCode(true);
    try {
      const res = await fetch("/api/vouchers/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: raw }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setCodeError(body?.message ?? "Could not check that code");
        return;
      }
      const match = body as DiscountCode;
      if (
        match.kind === "percent" &&
        appliedCodeObjects.some((c) => c.kind === "percent")
      ) {
        setCodeError("Only one percentage discount can be used");
        return;
      }
      setAppliedCodeObjects((prev) => [...prev, match]);
      setCodeInput("");
      setCodeError(null);
    } catch {
      setCodeError("Could not check that code. Please try again.");
    } finally {
      setCheckingCode(false);
    }
  };

  const handleRemoveCode = (code: string) => {
    setAppliedCodeObjects((prev) => prev.filter((c) => c.code !== code));
    setCodeError(null);
  };

  // Stacked discounts with a global cap (same maths the server charges)
  const {
    grandBeforeCodes,
    percentCode,
    percentDiscountAmount,
    absoluteDiscountAmount,
    grandAfterCodes,
    capApplied,
  } = useMemo(
    () => applyDiscountCodes(grandTotalRaw, appliedCodeObjects, discountCap),
    [grandTotalRaw, appliedCodeObjects, discountCap]
  );

  const effectiveGrandTotal = grandAfterCodes;

  const cartLines = useMemo(
    () =>
      Object.entries(lines).flatMap(([storeId, skus]) =>
        Object.entries(skus)
          .filter(([, qty]) => qty > 0)
          .map(([sku, qty]) => ({ storeId, sku, qty }))
      ),
    [lines]
  );

  // ----- New flow state: details first, payment second -----
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [buyer, setBuyer] = useState<CheckoutFormValues | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={700}>
        Cart
      </Typography>

      {/* CART LIST */}
      <Stack spacing={2}>
        {nonEmptyStoreIds.length === 0 && (
          <Paper sx={{ p: 2 }}>
            <Typography color="text.secondary">Your cart is empty.</Typography>
          </Paper>
        )}

        {nonEmptyStoreIds.map((storeId) => (
          <StoreCartCard
            key={storeId}
            storeId={storeId}
            onCalcChange={(entry) => upsertCalc(storeId, entry)}
            onClearStore={() => {
              clearStore(storeId);
              upsertCalc(storeId, null);
            }}
          />
        ))}
      </Stack>

      {/* GRAND TOTAL + DISCOUNT CODES */}
      <Paper sx={{ p: 2 }}>
        {/* Pre-discount total */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 1,
          }}
        >
          <Typography color="text.secondary">
            Grand total (before codes)
          </Typography>
          <Typography fontWeight={600}>{money(grandBeforeCodes)}</Typography>
        </Box>

        {/* Discount code input */}
        {grandBeforeCodes > 0 && (
          <Box sx={{ mt: 1, mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Discount codes
            </Typography>
            <Box
              sx={{
                display: "flex",
                gap: 1,
                flexWrap: "wrap",
                alignItems: "start",
              }}
            >
              <TextField
                size="small"
                label="Enter code"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleApplyCode();
                  }
                }}
                error={!!codeError}
                helperText={codeError || " "}
              />
              <Button
                variant="outlined"
                size="medium"
                onClick={handleApplyCode}
                disabled={checkingCode}
              >
                {checkingCode ? "Checking…" : "Apply"}
              </Button>
            </Box>

            {appliedCodeObjects.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                {appliedCodeObjects.map((dc) => (
                  <Chip
                    key={dc.code}
                    label={
                      dc.kind === "percent"
                        ? `${dc.code} — ${dc.amount}% off`
                        : `${dc.code} — ${money(dc.amount)} off`
                    }
                    onDelete={() => handleRemoveCode(dc.code)}
                    size="small"
                  />
                ))}
              </Stack>
            )}
          </Box>
        )}

        {/* Discount summary */}
        {(percentDiscountAmount > 0 || absoluteDiscountAmount > 0) && (
          <Stack spacing={0.25} sx={{ mb: 1.5 }}>
            {percentDiscountAmount > 0 && (
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography color="text.secondary">
                  {percentCode
                    ? `Percent discount (${percentCode.code})`
                    : "Percent discount"}
                </Typography>
                <Typography color="success.main" fontWeight={600}>
                  − {money(percentDiscountAmount)}
                </Typography>
              </Box>
            )}
            {absoluteDiscountAmount > 0 && (
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography color="text.secondary">
                  Absolute discounts
                </Typography>
                <Typography color="success.main" fontWeight={600}>
                  − {money(absoluteDiscountAmount)}
                </Typography>
              </Box>
            )}
            {capApplied && (
              <Typography variant="body2" color="warning.main" sx={{ mt: 0.5 }}>
                You have exceeded the maximum discount limit. Your discount has
                been capped.
              </Typography>
            )}
          </Stack>
        )}

        {/* Final total after codes */}
        <Box
          sx={{
            mt: 1,
            pt: 1,
            borderTop: "1px solid",
            borderColor: "divider",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography variant="h6">Grand Total</Typography>
          <Typography variant="h6" fontWeight={700}>
            {money(effectiveGrandTotal)}
          </Typography>
        </Box>

        <Box sx={{ mt: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            size="large"
            disabled={richItems.length === 0}
            onClick={() => setDetailsOpen(true)} // details first
          >
            Proceed to Checkout
          </Button>
          {richItems.length > 0 && (
            <Button variant="text" color="error" onClick={() => clear()}>
              Clear Cart
            </Button>
          )}
        </Box>
      </Paper>

      {/* 1) Checkout details modal (name, class, justifications) */}
      <CheckoutFormDialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onSubmit={(vals) => {
          setBuyer(vals);
          setDetailsOpen(false);
          setPayOpen(true); // open payment next
        }}
        items={richItems}
        classes={classes}
      />

      {/* 2) Payment modal (server re-prices, charges the card, uses the codes) */}
      <PaymentDialog
        open={payOpen && !!buyer}
        onClose={() => setPayOpen(false)}
        amount={effectiveGrandTotal}
        lines={cartLines}
        codes={appliedCodeObjects.map((c) => c.code)}
        onCodeRejected={handleRemoveCode}
        buyer={buyer ?? { name: "", className: "", justifications: [] }}
        onPaid={(payload) => {
          localStorage.setItem("last-order", JSON.stringify(payload));
          clear();
          setPayOpen(false);
          setBuyer(null);
          nav("/receipt");
        }}
      />
    </Stack>
  );
}
