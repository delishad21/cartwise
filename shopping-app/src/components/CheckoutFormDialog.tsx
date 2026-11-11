// src/components/CheckoutFormDialog.tsx
import { useEffect, useMemo } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
  LinearProgress,
} from "@mui/material";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { money } from "../lib/format";

type JustEntry = { key: string; text: string };

export type CheckoutFormValues = {
  name: string;
  className: string;
  justifications: { sku: string; text: string }[];
};

export type CheckoutItem = {
  sku: string;
  name: string;
  img?: string;
  storeName?: string;
  qty?: number;
  unitPrice?: number;
  lineTotal?: number;
};

const baseSchema = z.object({
  name: z.string().min(1, "Required"),
  className: z.string().min(1, "Required"),
  justifications: z.array(
    z.object({
      key: z.string().min(1, "Pick a product"),
      text: z.string().trim().min(1, "Tell us why"),
    })
  ),
});

function keyOf(i: CheckoutItem) {
  return `${i.storeName || "Store"}::${i.sku}`;
}

export default function CheckoutFormDialog({
  open,
  onClose,
  onSubmit,
  items,
  classes,
  justificationsRequired,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: CheckoutFormValues) => void;
  items: CheckoutItem[];
  classes: string[];
  /** from Admin → Settings; capped by the different products in the cart */
  justificationsRequired: number;
}) {
  const itemsInCart = useMemo(
    () => items.filter((i) => (i.qty ?? 0) > 0),
    [items]
  );

  const optionList = useMemo(
    () =>
      itemsInCart.map((i) => ({
        key: keyOf(i),
        item: i,
      })),
    [itemsInCart]
  );

  const byKey = useMemo(
    () => Object.fromEntries(optionList.map((o) => [o.key, o.item] as const)),
    [optionList]
  );

  const uniqueKeys = useMemo(
    () => Array.from(new Set(optionList.map((o) => o.key))),
    [optionList]
  );

  // the server counts different products by SKU, so do the same here
  const distinctSkus = useMemo(
    () => new Set(optionList.map((o) => o.item.sku)).size,
    [optionList]
  );

  const justifyCount = Math.max(
    0,
    Math.min(3, justificationsRequired, distinctSkus)
  );

  const schema = useMemo(
    () =>
      baseSchema.extend({
        justifications: baseSchema.shape.justifications
          .length(justifyCount)
          .refine(
            (js) => new Set(js.map((j) => byKey[j.key]?.sku ?? j.key)).size === js.length,
            "Pick a different product for each justification"
          ),
      }),
    [justifyCount, byKey]
  );

  const defaultJustifications = useMemo<JustEntry[]>(
    () =>
      Array.from({ length: justifyCount }).map((_, i) => ({
        key: uniqueKeys[i] ?? "",
        text: "",
      })),
    [uniqueKeys, justifyCount]
  );

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    getValues,
  } = useForm<{ name: string; className: string; justifications: JustEntry[] }>(
    {
      resolver: zodResolver(schema),
      defaultValues: {
        name: "",
        className: "",
        justifications: defaultJustifications,
      },
    }
  );

  useEffect(() => {
    if (!open) return;

    const current = getValues();
    const visible = (current.justifications ?? []).slice(0, justifyCount);
    const next: JustEntry[] = Array.from({ length: justifyCount }).map(
      (_, i) => {
        const candidate = visible[i];
        const keyOk =
          candidate?.key && uniqueKeys.includes(candidate.key)
            ? candidate.key
            : uniqueKeys[i] ?? "";
        return {
          key: keyOk,
          text: candidate?.text ?? "",
        };
      }
    );

    reset(
      {
        name: current.name ?? "",
        className: current.className ?? "",
        justifications: next,
      },
      { keepDirty: false, keepTouched: false }
    );
  }, [open, justifyCount, uniqueKeys.join("|")]);

  const visibleJusts = (watch("justifications") ?? []).slice(0, justifyCount);
  const chosenSkus = visibleJusts.map((j) => byKey[j?.key ?? ""]?.sku ?? "");

  const renderOptionRow = (opt: CheckoutItem) => {
    const qty = opt.qty ?? 0;
    const unit = opt.unitPrice ?? 0;
    const line = qty * unit;
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
        <Box
          component="img"
          src={opt.img}
          alt={opt.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          sx={{
            width: 36,
            height: 36,
            borderRadius: 0.75,
            objectFit: "cover",
            flexShrink: 0,
            bgcolor: "action.hover",
          }}
        />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap fontWeight={600} title={opt.name}>
            {opt.name}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            title={opt.storeName}
          >
            ({opt.storeName || "Store"})
          </Typography>
        </Box>
        <Box sx={{ ml: "auto", pl: 1, textAlign: "right" }}>
          <Typography variant="body2" color="text.secondary">
            {qty} × {money(unit)}
          </Typography>
          <Typography variant="caption" fontWeight={600}>
            {money(line)}
          </Typography>
        </Box>
      </Box>
    );
  };

  const submitHandler = handleSubmit(async (values) => {
    const compactJusts = (values.justifications ?? [])
      .slice(0, justifyCount)
      .map(({ key, text }) => ({ sku: byKey[key]?.sku ?? "", text: text.trim() }));

    onSubmit({
      name: values.name,
      className: values.className,
      justifications: compactJusts,
    });
  });

  return (
    <Dialog
      open={open}
      onClose={isSubmitting ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>
        Checkout details
        {isSubmitting && <LinearProgress sx={{ mt: 1 }} />}
      </DialogTitle>

      <DialogContent dividers>
        <Stack
          component="form"
          id="checkout-form"
          spacing={2}
          onSubmit={submitHandler}
          sx={{
            mt: 1,
            opacity: isSubmitting ? 0.6 : 1,
            pointerEvents: isSubmitting ? "none" : "auto",
          }}
        >
          <TextField
            label="Name"
            {...register("name")}
            error={!!errors.name}
            helperText={errors.name?.message}
            fullWidth
          />

          <TextField
            label="Group"
            select
            {...register("className")}
            error={!!errors.className}
            helperText={errors.className?.message}
            fullWidth
          >
            {classes.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>

          {justifyCount > 0 && (
            <Divider textAlign="left">
              Justify {justifyCount} chosen product{justifyCount > 1 ? "s" : ""}
            </Divider>
          )}

          {Array.from({ length: justifyCount }).map((_, idx) => (
            <Box key={idx} sx={{ display: "grid", gap: 1 }}>
              <Controller
                control={control}
                name={`justifications.${idx}.key`}
                render={({ field }) => (
                  <TextField
                    select
                    label={`Product #${idx + 1}`}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    error={!!errors.justifications?.[idx]?.key}
                    helperText={errors.justifications?.[idx]?.key?.message}
                    fullWidth
                    SelectProps={{
                      MenuProps: {
                        PaperProps: { style: { maxHeight: 360 } },
                        keepMounted: true,
                      },
                      renderValue: (value) => {
                        const opt = byKey[String(value)];
                        return opt ? (
                          renderOptionRow(opt)
                        ) : (
                          <em>Select a product…</em>
                        );
                      },
                    }}
                  >
                    <MenuItem value="">
                      <em>Select a product…</em>
                    </MenuItem>
                    {optionList.map(({ key, item }) => (
                      <MenuItem
                        key={key}
                        value={key}
                        disabled={
                          chosenSkus.some((s, i) => i !== idx && s === item.sku)
                        }
                      >
                        {renderOptionRow(item)}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />

              <TextField
                label="Why did you pick this?"
                {...register(`justifications.${idx}.text` as const)}
                error={!!errors.justifications?.[idx]?.text}
                helperText={errors.justifications?.[idx]?.text?.message}
                multiline
                minRows={2}
                fullWidth
              />
            </Box>
          ))}

          {justifyCount > 0 &&
            (errors.justifications?.message || errors.justifications?.root?.message) && (
              <Typography variant="body2" color="error">
                {errors.justifications?.message || errors.justifications?.root?.message}
              </Typography>
            )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Back
        </Button>
        <Button
          type="submit"
          form="checkout-form"
          variant="contained"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Submitting…" : "Continue to Payment"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
