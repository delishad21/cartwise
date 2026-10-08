// src/admin/pages/Orders.tsx
import { Fragment, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import DownloadIcon from "@mui/icons-material/Download";
import { money } from "../../lib/format";
import { api, spacedCard, useApi, when, type AdminOrder } from "../api";
import { ConfirmDialog, PageHeader } from "../components";
import { useToast } from "../utils";

export default function Orders() {
  const { data, error, reload } = useApi<AdminOrder[]>("/api/admin/orders", 10_000);
  const [q, setQ] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<AdminOrder | null>(null);
  const [toast, showToast] = useToast();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter(
      (o) =>
        (showVoided || !o.voidedAt) &&
        (!needle ||
          o.name.toLowerCase().includes(needle) ||
          `group ${o.group}`.includes(needle) ||
          o.group.toLowerCase() === needle ||
          o.codes.some((c) => c.toLowerCase().includes(needle)) ||
          o.cardNumber.includes(needle.replace(/\s/g, "")))
    );
  }, [data, q, showVoided]);

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Every checkout, newest first. Updates every 10 seconds."
        actions={
          <Button variant="outlined" startIcon={<DownloadIcon />} href="/api/admin/orders.csv">
            Download CSV
          </Button>
        }
      />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }} alignItems={{ sm: "center" }}>
        <TextField
          size="small"
          label="Search name, group, code or card"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ minWidth: 300 }}
        />
        <FormControlLabel
          control={<Switch checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />}
          label="Show voided"
        />
        <Typography variant="body2" color="text.secondary">
          {rows.length} order{rows.length === 1 ? "" : "s"}
        </Typography>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!data && !error && <LinearProgress />}

      {data && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={48} />
                <TableCell>Time</TableCell>
                <TableCell>Group</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Vouchers</TableCell>
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography color="text.secondary" sx={{ py: 2 }} textAlign="center">
                      No orders yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((o) => (
                <Fragment key={o.id}>
                  <TableRow
                    hover
                    onClick={() => setOpen(open === o.id ? null : o.id)}
                    sx={{ cursor: "pointer", "& > td": { borderBottom: open === o.id ? "unset" : undefined }, opacity: o.voidedAt ? 0.55 : 1 }}
                  >
                    <TableCell>
                      <IconButton size="small" aria-label="Show details">
                        {open === o.id ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{when(o.createdAt)}</TableCell>
                    <TableCell>
                      <strong>{o.group}</strong>
                    </TableCell>
                    <TableCell>
                      {o.name} {o.voidedAt && <Chip size="small" label="Voided" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {o.codes.map((c) => (
                          <Chip key={c} size="small" label={c} variant="outlined" />
                        ))}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <strong>{money(o.total)}</strong>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 0 }}>
                      <Collapse in={open === o.id} unmountOnExit>
                        <OrderDetail order={o} onVoid={() => setVoiding(o)} />
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ConfirmDialog
        open={!!voiding}
        title={`Void Group ${voiding?.group}'s order?`}
        body={
          <>
            {money(voiding?.total ?? 0)} goes back onto card {spacedCard(voiding?.cardNumber ?? "")}
            {voiding?.codes.length ? `, and ${voiding.codes.join(", ")} can be used again` : ""}. The order stays in the list, marked as voided.
          </>
        }
        confirmLabel="Void order"
        onClose={() => setVoiding(null)}
        onConfirm={async () => {
          await api("POST", `/api/admin/orders/${voiding!.id}/void`);
          await reload();
          showToast("Order voided and refunded");
        }}
      />
      {toast}
    </>
  );
}

function OrderDetail({ order, onVoid }: { order: AdminOrder; onVoid: () => void }) {
  const p = order.payload;
  const byStore = new Map<string, typeof p.items>();
  for (const i of p.items) byStore.set(i.storeName ?? i.storeId, [...(byStore.get(i.storeName ?? i.storeId) ?? []), i]);
  const od = p.overallDiscounts;

  return (
    <Box sx={{ py: 2, px: { xs: 0, sm: 2 } }}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Items
          </Typography>
          <Stack spacing={1.5}>
            {[...byStore.entries()].map(([store, items]) => {
              const t = p.perStoreTotals.find((s) => (s.storeName ?? s.storeId) === store);
              return (
                <Box key={store}>
                  <Typography fontWeight={700}>{store}</Typography>
                  {items.map((i) => (
                    <Stack key={i.sku} direction="row" spacing={1} sx={{ pl: 1 }}>
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {i.name} × {i.qty} @ {money(i.unitPrice)}
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {money(i.finalLineTotal)}
                      </Typography>
                    </Stack>
                  ))}
                  {t && (
                    <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                      Subtotal {money(t.itemsSubtotal)} · discount −{money(t.itemsDiscount)} · GST {money(t.gst)} · shipping{" "}
                      {money(t.shippingNet)} · <strong>store total {money(t.storeTotal)}</strong>
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Stack>

          {p.justifications.length > 0 && (
            <>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }} gutterBottom>
                Justifications
              </Typography>
              <Stack spacing={1}>
                {p.justifications.map((j, k) => (
                  <Box key={k}>
                    <Typography variant="body2" fontWeight={700}>
                      {p.items.find((i) => i.sku === j.sku)?.name ?? j.sku}
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                      {j.text}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </>
          )}
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Payment
          </Typography>
          <Stack spacing={0.5}>
            {od && (
              <>
                <Line label="Before vouchers" value={money(od.grandTotalBeforeDiscounts)} />
                <Line label={`Vouchers (${order.codes.join(", ")})`} value={`− ${money(od.percentDiscountAmount + od.absoluteDiscountAmount)}`} />
                {od.capApplied && (
                  <Typography variant="caption" color="warning.main">
                    Discount was capped
                  </Typography>
                )}
              </>
            )}
            <Line label="Charged" value={money(p.paymentInfo.chargeAmount)} bold />
            <Line label="Gift card" value={spacedCard(order.cardNumber)} />
            <Line label="Card balance" value={`${money(p.paymentInfo.balanceBefore)} → ${money(p.paymentInfo.balanceAfter)}`} />
          </Stack>
          {!order.voidedAt ? (
            <Button color="error" variant="outlined" size="small" sx={{ mt: 2 }} onClick={onVoid}>
              Void & refund…
            </Button>
          ) : (
            <Alert severity="info" sx={{ mt: 2 }}>
              Voided {when(order.voidedAt)}. The card was refunded and its vouchers released.
            </Alert>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={bold ? 800 : 600} textAlign="right">
        {value}
      </Typography>
    </Stack>
  );
}
