// src/components/PaymentDialog.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  TextField,
  Typography,
  Alert,
} from "@mui/material";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { CheckoutFormValues } from "./CheckoutFormDialog";

const schema = z.object({
  cardNumber: z
    .string()
    .trim()
    // printed cards group digits in 4s; the server strips spaces
    .regex(/^(\d\s*){6,24}$/, "Enter 6–24 digits"),
});

/** Server error codes that belong under the card number field */
const CARD_ERRORS = ["CARD_NOT_FOUND", "CARD_WRONG_GROUP", "INSUFFICIENT_BALANCE", "CARD_CHANGED"];

export default function PaymentDialog({
  open,
  onClose,
  amount,
  lines,
  codes,
  onCodeRejected,
  buyer,
  onPaid,
}: {
  open: boolean;
  onClose: () => void;
  amount: number;
  lines: { storeId: string; sku: string; qty: number }[];
  codes: string[];
  /** a voucher was used by someone else in the meantime */
  onCodeRejected: (code: string) => void;
  buyer: CheckoutFormValues;
  onPaid: (payload: unknown) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    reset,
  } = useForm<{ cardNumber: string }>({
    resolver: zodResolver(schema),
    defaultValues: { cardNumber: "" },
  });

  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    reset({ cardNumber: "" });
    setFormError(null);
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    let res: Response;
    try {
      res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: buyer.name,
          className: buyer.className,
          justifications: buyer.justifications,
          lines,
          codes,
          cardNumber: values.cardNumber,
          expectedTotal: amount,
        }),
      });
    } catch {
      setFormError("Could not reach the shop. Check your connection and try again.");
      return;
    }

    const body = await res.json().catch(() => null);
    if (res.ok) {
      onPaid(body);
      return;
    }

    const message: string = body?.message ?? "Payment failed. Please try again.";
    if (CARD_ERRORS.includes(body?.error)) {
      setError("cardNumber", { type: "validate", message });
    } else if (body?.error === "CODE_USED" || body?.error === "CODE_NOT_FOUND") {
      if (body.code) onCodeRejected(body.code);
      setFormError(`${message}. It has been removed from your order — please check the new total.`);
    } else {
      setFormError(message);
    }
  });

  const prettyAmount = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "SGD",
      }).format(amount ?? 0),
    [amount]
  );

  return (
    <Dialog
      open={open}
      onClose={isSubmitting ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Redeem Gift Card</DialogTitle>
      <DialogContent dividers>
        <Stack
          spacing={2}
          component="form"
          id="payment-form"
          onSubmit={onSubmit}
        >
          <Typography variant="body2" color="text.secondary">
            Amount to pay: <strong>{prettyAmount}</strong>
          </Typography>

          {formError && <Alert severity="error">{formError}</Alert>}

          <TextField
            label="Gift card number"
            placeholder="e.g. 7777 0000 0001"
            {...register("cardNumber")}
            error={!!errors.cardNumber}
            helperText={errors.cardNumber?.message || " "}
            inputMode="numeric"
            autoComplete="off"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          form="payment-form"
          variant="contained"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Processing…" : "Redeem & Pay"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
