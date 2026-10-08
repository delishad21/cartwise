// src/admin/pages/Overview.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { money } from "../../lib/format";
import { api, useApi, voucherLabel, when, type Overview as OverviewData } from "../api";
import { ConfirmDialog, PageHeader, StatCard } from "../components";
import { useToast } from "../utils";

export default function Overview() {
  const { data, error, reload } = useApi<OverviewData>("/api/admin/overview", 10_000);
  const [reset, setReset] = useState({ orders: true, vouchers: true, cards: true });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, showToast] = useToast();

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <LinearProgress />;

  const { orders, vouchers, cards, recent } = data;

  return (
    <>
      <PageHeader title="Overview" subtitle="Updates every 10 seconds while open." />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard label="Orders" value={orders.count} hint={`${money(orders.spent)} spent in total`} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            label="Groups checked out"
            value={orders.groupsTotal ? `${orders.groupsOrdered} / ${orders.groupsTotal}` : orders.groupsOrdered}
            hint={orders.groupsTotal ? `${orders.groupsTotal - orders.groupsOrdered} still to go` : undefined}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard label="Gift cards used" value={`${cards.used} / ${cards.total}`} hint={`${money(cards.remaining)} left on all cards`} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            label="Vouchers used"
            value={`${vouchers.reduce((a, v) => a + v.used, 0)} / ${vouchers.reduce((a, v) => a + v.total, 0)}`}
            hint="across all values"
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 2, height: "100%" }}>
            <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
                Latest orders
              </Typography>
              <Button component={Link} to="/admin/orders" size="small">
                See all
              </Button>
            </Stack>
            {recent.length === 0 && <Typography color="text.secondary">No orders yet.</Typography>}
            <Stack divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
              {recent.map((o) => (
                <Stack key={o.id} direction="row" spacing={2} sx={{ py: 1 }} alignItems="center">
                  <Typography fontWeight={700} sx={{ width: 90 }}>
                    Group {o.group}
                  </Typography>
                  <Typography sx={{ flex: 1, minWidth: 0 }} noWrap>
                    {o.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ display: { xs: "none", sm: "block" } }}>
                    {when(o.createdAt)}
                  </Typography>
                  <Typography fontWeight={700}>{money(o.total)}</Typography>
                </Stack>
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
              Vouchers by value
            </Typography>
            {vouchers.length === 0 && <Typography color="text.secondary">No vouchers yet.</Typography>}
            <Stack spacing={1.5}>
              {vouchers.map((v) => (
                <Box key={`${v.kind}:${v.amount}`}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography fontWeight={600}>{voucherLabel(v)}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {v.used} used · {v.total - v.used} left
                    </Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={v.total ? (v.used / v.total) * 100 : 0} sx={{ height: 8, borderRadius: 4, mt: 0.5 }} />
                </Box>
              ))}
            </Stack>
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={700}>
              Start a new lesson
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Clears this lesson's activity. Stores, items, vouchers and cards themselves are kept.
            </Typography>
            <Stack>
              <FormControlLabel
                control={<Checkbox checked={reset.orders} onChange={(e) => setReset({ ...reset, orders: e.target.checked })} />}
                label="Delete all orders"
              />
              <FormControlLabel
                control={<Checkbox checked={reset.vouchers} onChange={(e) => setReset({ ...reset, vouchers: e.target.checked })} />}
                label="Make all vouchers usable again"
              />
              <FormControlLabel
                control={<Checkbox checked={reset.cards} onChange={(e) => setReset({ ...reset, cards: e.target.checked })} />}
                label="Refill every gift card to its starting balance"
              />
            </Stack>
            <Button
              variant="outlined"
              color="error"
              sx={{ mt: 1 }}
              disabled={!reset.orders && !reset.vouchers && !reset.cards}
              onClick={() => setConfirmOpen(true)}
            >
              Reset…
            </Button>
          </Paper>
        </Grid>
      </Grid>

      <ConfirmDialog
        open={confirmOpen}
        title="Reset for a new lesson?"
        body="This can't be undone. Download the orders CSV first if you want to keep a record."
        confirmLabel="Reset"
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await api("POST", "/api/admin/reset", reset);
          await reload();
          showToast("Reset done");
        }}
      />
      {toast}
    </>
  );
}
