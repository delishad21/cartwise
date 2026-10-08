// src/admin/pages/StoreEditor.tsx — one store: details, discounts, banners, items
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
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
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { money } from "../../lib/format";
import type { DiscountRule, Product, StoreAlert } from "../../lib/types";
import { api, useApi, type AdminStore } from "../api";
import { AlertsEditor, ConfirmDialog, ImageField } from "../components";
import { num, slugify, useToast } from "../utils";

type Form = {
  name: string;
  cover: string;
  shippingBaseFee: string;
  maxQtyPerItem: string;
  showDiscountBreakdown: boolean;
  alerts: StoreAlert[];
  overall: { on: boolean; percentOff: string };
  nth: { on: boolean; nth: string; percentOff: string };
  ship: { on: boolean; threshold: string; shippingPercentOff: string };
};

function toForm(s: AdminStore): Form {
  const o = s.discounts.find((d) => d.type === "overallPercent") as Extract<DiscountRule, { type: "overallPercent" }> | undefined;
  const n = s.discounts.find((d) => d.type === "nthItemPercent") as Extract<DiscountRule, { type: "nthItemPercent" }> | undefined;
  const sh = s.discounts.find((d) => d.type === "shippingThreshold") as Extract<DiscountRule, { type: "shippingThreshold" }> | undefined;
  return {
    name: s.name,
    cover: s.cover,
    shippingBaseFee: String(s.shipping.baseFee),
    maxQtyPerItem: String(s.constraints.maxQtyPerItem),
    showDiscountBreakdown: s.showDiscountBreakdown,
    alerts: s.alerts,
    overall: { on: !!o, percentOff: String(o?.percentOff ?? 10) },
    nth: { on: !!n, nth: String(n?.nth ?? 3), percentOff: String(n?.percentOff ?? 50) },
    ship: { on: !!sh, threshold: String(sh?.threshold ?? 100), shippingPercentOff: String(sh?.shippingPercentOff ?? 100) },
  };
}

function fromForm(f: Form) {
  const discounts: DiscountRule[] = [];
  if (f.overall.on) discounts.push({ type: "overallPercent", percentOff: num(f.overall.percentOff) });
  if (f.nth.on) discounts.push({ type: "nthItemPercent", nth: num(f.nth.nth), percentOff: num(f.nth.percentOff) });
  if (f.ship.on) discounts.push({ type: "shippingThreshold", threshold: num(f.ship.threshold), shippingPercentOff: num(f.ship.shippingPercentOff) });
  return {
    name: f.name.trim(),
    cover: f.cover,
    shippingBaseFee: num(f.shippingBaseFee),
    maxQtyPerItem: num(f.maxQtyPerItem),
    showDiscountBreakdown: f.showDiscountBreakdown,
    alerts: f.alerts.filter((a) => a.message.trim()),
    discounts,
  };
}

const pct = { endAdornment: <InputAdornment position="end">%</InputAdornment> };
const sgd = { startAdornment: <InputAdornment position="start">S$</InputAdornment> };

export default function StoreEditor() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data, error, reload } = useApi<AdminStore[]>("/api/admin/stores");
  const store = data?.find((s) => s.id === id);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteStore, setDeleteStore] = useState(false);
  const [toast, showToast] = useToast();

  // load the form once per store (don't clobber edits when products reload)
  useEffect(() => {
    if (store) setForm(toForm(store));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <LinearProgress />;
  if (!store) return <Alert severity="warning">Store not found. <Link to="/admin/stores">Back to stores</Link></Alert>;
  if (!form) return <LinearProgress />;

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const body = fromForm(form);
  const invalid =
    !body.name ||
    !(body.shippingBaseFee >= 0) ||
    !(Number.isInteger(body.maxQtyPerItem) && body.maxQtyPerItem >= 1) ||
    body.discounts.some((d) => Object.values(d).some((v) => typeof v === "number" && !(v >= 0)));

  const moveProduct = async (i: number, dir: -1 | 1) => {
    const skus = store.products.map((p) => p.sku);
    [skus[i], skus[i + dir]] = [skus[i + dir], skus[i]];
    await api("POST", `/api/admin/stores/${id}/products/reorder`, { skus });
    await reload();
  };

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton component={Link} to="/admin/stores" aria-label="Back to stores">
          <ChevronLeftIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={800} sx={{ flex: 1 }}>
          {store.name}
        </Typography>
        <Button component={Link} to={`/store/${store.id}`} target="_blank">
          View in shop
        </Button>
      </Stack>

      <Grid container spacing={2}>
        {/* ------------------------------------------------ store settings */}
        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Store details
            </Typography>
            <Stack spacing={2}>
              {saveError && <Alert severity="error">{saveError}</Alert>}
              <TextField label="Name" value={form.name} onChange={(e) => set({ name: e.target.value })} />
              <ImageField label="Cover photo (shown on the home page)" value={form.cover} onChange={(cover) => set({ cover })} aspect="16 / 9" />
              <Stack direction="row" spacing={2}>
                <TextField label="Shipping fee" type="number" value={form.shippingBaseFee} onChange={(e) => set({ shippingBaseFee: e.target.value })} slotProps={{ input: sgd, htmlInput: { min: 0, step: 0.1 } }} fullWidth />
                <TextField label="Max of each item" type="number" value={form.maxQtyPerItem} onChange={(e) => set({ maxQtyPerItem: e.target.value })} slotProps={{ htmlInput: { min: 1, step: 1 } }} fullWidth />
              </Stack>

              <Typography variant="subtitle2" sx={{ pt: 1 }}>
                Discounts
              </Typography>
              <Box>
                <FormControlLabel control={<Checkbox checked={form.overall.on} onChange={(e) => set({ overall: { ...form.overall, on: e.target.checked } })} />} label="Storewide discount" />
                {form.overall.on && (
                  <TextField size="small" label="Off every item" type="number" value={form.overall.percentOff} onChange={(e) => set({ overall: { ...form.overall, percentOff: e.target.value } })} slotProps={{ input: pct }} sx={{ ml: 4, width: 160 }} />
                )}
              </Box>
              <Box>
                <FormControlLabel control={<Checkbox checked={form.nth.on} onChange={(e) => set({ nth: { ...form.nth, on: e.target.checked } })} />} label="Every Nth item discounted (cheapest items first)" />
                {form.nth.on && (
                  <Stack direction="row" spacing={1} sx={{ ml: 4 }}>
                    <TextField size="small" label="Every Nth item" type="number" value={form.nth.nth} onChange={(e) => set({ nth: { ...form.nth, nth: e.target.value } })} slotProps={{ htmlInput: { min: 1 } }} sx={{ width: 140 }} />
                    <TextField size="small" label="Off that item" type="number" value={form.nth.percentOff} onChange={(e) => set({ nth: { ...form.nth, percentOff: e.target.value } })} slotProps={{ input: pct }} sx={{ width: 140 }} />
                  </Stack>
                )}
              </Box>
              <Box>
                <FormControlLabel control={<Checkbox checked={form.ship.on} onChange={(e) => set({ ship: { ...form.ship, on: e.target.checked } })} />} label="Cheaper shipping above a spend" />
                {form.ship.on && (
                  <Stack direction="row" spacing={1} sx={{ ml: 4 }}>
                    <TextField size="small" label="Items total at least" type="number" value={form.ship.threshold} onChange={(e) => set({ ship: { ...form.ship, threshold: e.target.value } })} slotProps={{ input: sgd }} sx={{ width: 170 }} />
                    <TextField size="small" label="Off shipping" type="number" value={form.ship.shippingPercentOff} onChange={(e) => set({ ship: { ...form.ship, shippingPercentOff: e.target.value } })} slotProps={{ input: pct }} sx={{ width: 140 }} helperText="100% = free" />
                  </Stack>
                )}
              </Box>
              <FormControlLabel
                control={<Switch checked={form.showDiscountBreakdown} onChange={(e) => set({ showDiscountBreakdown: e.target.checked })} />}
                label="Show per-item discount breakdown (turn off to make students work it out)"
              />

              <Typography variant="subtitle2" sx={{ pt: 1 }}>
                Banners on the store page
              </Typography>
              <AlertsEditor value={form.alerts} onChange={(alerts) => set({ alerts })} />

              <Stack direction="row" spacing={1} sx={{ pt: 1 }}>
                <Button
                  variant="contained"
                  disabled={invalid || saving}
                  onClick={async () => {
                    setSaving(true);
                    setSaveError(null);
                    try {
                      await api("PUT", `/api/admin/stores/${id}`, body);
                      await reload();
                      showToast("Store saved");
                    } catch (e) {
                      setSaveError((e as Error).message);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? "Saving…" : "Save store"}
                </Button>
                <Button onClick={() => setForm(toForm(store))} disabled={saving}>
                  Undo changes
                </Button>
                <Box sx={{ flex: 1 }} />
                <Button color="error" onClick={() => setDeleteStore(true)}>
                  Delete store
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </Grid>

        {/* ------------------------------------------------ products */}
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
                Items ({store.products.length})
              </Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing("new")}>
                Add item
              </Button>
            </Stack>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={64} />
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right" width={170} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {store.products.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                          No items yet.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {store.products.map((p, i) => (
                    <TableRow key={p.sku} hover>
                      <TableCell>
                        <Avatar variant="rounded" src={p.img} alt="" sx={{ width: 48, height: 48, bgcolor: "action.hover" }} imgProps={{ style: { objectFit: "contain" } }} />
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight={600}>{p.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {p.sku}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <strong>{money(p.price)}</strong>
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        <IconButton size="small" aria-label="Move up" disabled={i === 0} onClick={() => moveProduct(i, -1)}>
                          <ArrowUpwardIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" aria-label="Move down" disabled={i === store.products.length - 1} onClick={() => moveProduct(i, 1)}>
                          <ArrowDownwardIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" aria-label="Edit item" onClick={() => setEditing(p)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" aria-label="Delete item" onClick={() => setDeleting(p)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      <ProductDialog
        storeId={id}
        product={editing}
        onClose={() => setEditing(null)}
        onDone={async (msg) => {
          await reload();
          showToast(msg);
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.name}?`}
        body="Students who already have it in their cart will see it disappear. Past orders keep it."
        confirmLabel="Delete"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await api("DELETE", `/api/admin/stores/${id}/products/${encodeURIComponent(deleting!.sku)}`);
          await reload();
          showToast("Item deleted");
        }}
      />
      <ConfirmDialog
        open={deleteStore}
        title={`Delete ${store.name}?`}
        body={`This removes the store and all ${store.products.length} of its items. Past orders keep them.`}
        confirmLabel="Delete store"
        onClose={() => setDeleteStore(false)}
        onConfirm={async () => {
          await api("DELETE", `/api/admin/stores/${id}`);
          nav("/admin/stores");
        }}
      />
      {toast}
    </>
  );
}

function ProductDialog({
  storeId,
  product,
  onClose,
  onDone,
}: {
  storeId: string;
  product: Product | "new" | null;
  onClose: () => void;
  onDone: (msg: string) => Promise<void>;
}) {
  const isNew = product === "new";
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [skuTouched, setSkuTouched] = useState(false);
  const [price, setPrice] = useState("");
  const [img, setImg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!product) return;
    setError(null);
    if (product === "new") {
      setName("");
      setSku("");
      setSkuTouched(false);
      setPrice("");
      setImg("");
    } else {
      setName(product.name);
      setSku(product.sku);
      setSkuTouched(true);
      setPrice(String(product.price));
      setImg(product.img);
    }
  }, [product]);

  const effectiveSku = skuTouched ? sku : slugify(name);
  const valid = name.trim() && /^[a-z0-9][a-z0-9-]*$/.test(effectiveSku) && num(price) >= 0;

  return (
    <Dialog open={!!product} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? "Add item" : `Edit ${typeof product === "object" && product ? product.name : ""}`}</DialogTitle>
      <DialogContent>
        <Grid container spacing={3} sx={{ pt: 1 }}>
          <Grid size={{ xs: 12, sm: 5 }}>
            <ImageField label="Photo" value={img} onChange={setImg} />
          </Grid>
          <Grid size={{ xs: 12, sm: 7 }}>
            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField label="Name (shown to students)" value={name} onChange={(e) => setName(e.target.value)} autoFocus={isNew} />
              <TextField
                label="Price"
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                slotProps={{ input: sgd, htmlInput: { min: 0, step: 0.1 } }}
              />
              <TextField
                label="Item ID"
                value={effectiveSku}
                onChange={(e) => {
                  setSkuTouched(true);
                  setSku(e.target.value.toLowerCase());
                }}
                helperText="Lowercase letters, numbers and dashes. Must be unique in this store."
                size="small"
              />
            </Stack>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const body = { sku: effectiveSku, name: name.trim(), price: num(price), img };
            try {
              if (isNew) await api("POST", `/api/admin/stores/${storeId}/products`, body);
              else await api("PUT", `/api/admin/stores/${storeId}/products/${encodeURIComponent((product as Product).sku)}`, body);
              await onDone(isNew ? `Added ${body.name}` : `Saved ${body.name}`);
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {isNew ? "Add item" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
