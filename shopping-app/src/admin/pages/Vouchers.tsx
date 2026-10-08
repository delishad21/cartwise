// src/admin/pages/Vouchers.tsx
import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
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
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DownloadIcon from "@mui/icons-material/Download";
import { api, useApi, voucherLabel, when, type AdminVoucher } from "../api";
import { ConfirmDialog, PageHeader } from "../components";
import { num, useToast } from "../utils";

type Kind = "percent" | "absolute";

export default function Vouchers() {
  const { data, error, reload } = useApi<AdminVoucher[]>("/api/admin/vouchers", 15_000);
  const [value, setValue] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<"generate" | "add" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, showToast] = useToast();

  const values = useMemo(() => {
    const m = new Map<string, { kind: Kind; amount: number; total: number; used: number }>();
    for (const v of data ?? []) {
      const k = `${v.kind}:${v.amount}`;
      const e = m.get(k) ?? { kind: v.kind, amount: v.amount, total: 0, used: 0 };
      e.total++;
      if (v.usedAt) e.used++;
      m.set(k, e);
    }
    return [...m.entries()];
  }, [data]);

  const rows = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return (data ?? []).filter(
      (v) =>
        (value === "all" || `${v.kind}:${v.amount}` === value) &&
        (status === "all" || (status === "used") === !!v.usedAt) &&
        (!needle || v.code.includes(needle) || v.usedBy?.group === q.trim() || v.usedBy?.name?.toUpperCase().includes(needle))
    );
  }, [data, value, status, q]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.code));
  const toggle = (code: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });

  return (
    <>
      <PageHeader
        title="Vouchers"
        subtitle="Each code can be used once. Using it records which group it went to."
        actions={
          <>
            <Button variant="contained" startIcon={<AutoAwesomeIcon />} onClick={() => setDialog("generate")}>
              Generate codes
            </Button>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setDialog("add")}>
              Add a code
            </Button>
            <Button variant="outlined" startIcon={<DownloadIcon />} href="/api/admin/vouchers.csv">
              CSV
            </Button>
          </>
        }
      />

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        {values.map(([k, v]) => (
          <Chip
            key={k}
            label={`${voucherLabel(v)} · ${v.total - v.used} of ${v.total} left`}
            color={value === k ? "primary" : "default"}
            onClick={() => setValue(value === k ? "all" : k)}
          />
        ))}
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }} alignItems={{ sm: "center" }}>
        <TextField size="small" label="Search code, group or name" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 260 }} />
        <TextField select size="small" label="Value" value={value} onChange={(e) => setValue(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="all">All values</MenuItem>
          {values.map(([k, v]) => (
            <MenuItem key={k} value={k}>
              {voucherLabel(v)}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="unused">Not used yet</MenuItem>
          <MenuItem value="used">Used</MenuItem>
        </TextField>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {rows.length} shown
        </Typography>
        {selected.size > 0 && (
          <Button color="error" variant="outlined" onClick={() => setConfirmDelete(true)}>
            Delete {selected.size} selected…
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!data && !error && <LinearProgress />}

      {data && (
        <TableContainer component={Paper} sx={{ maxHeight: "65vh" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={!allSelected && rows.some((r) => selected.has(r.code))}
                    onChange={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        rows.forEach((r) => (allSelected ? n.delete(r.code) : n.add(r.code)));
                        return n;
                      })
                    }
                  />
                </TableCell>
                <TableCell>Code</TableCell>
                <TableCell>Value</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                      No vouchers match.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((v) => (
                <TableRow key={v.code} hover selected={selected.has(v.code)}>
                  <TableCell padding="checkbox">
                    <Checkbox checked={selected.has(v.code)} onChange={() => toggle(v.code)} />
                  </TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15 }}>{v.code}</TableCell>
                  <TableCell>{voucherLabel(v)}</TableCell>
                  <TableCell>
                    {v.usedAt ? (
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Chip size="small" color="warning" label={v.usedBy?.group ? `Used · Group ${v.usedBy.group}` : "Used"} />
                        <Typography variant="caption" color="text.secondary">
                          {v.usedBy?.name ? `${v.usedBy.name} · ` : ""}
                          {when(v.usedAt)}
                        </Typography>
                      </Stack>
                    ) : (
                      <Chip size="small" color="success" variant="outlined" label="Not used" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {v.usedAt && (
                      <Button
                        size="small"
                        onClick={async () => {
                          await api("POST", `/api/admin/vouchers/${encodeURIComponent(v.code)}/reset`);
                          await reload();
                          showToast(`${v.code} can be used again`);
                        }}
                      >
                        Make usable again
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <GenerateDialog
        open={dialog === "generate"}
        onClose={() => setDialog(null)}
        onDone={async (n) => {
          await reload();
          showToast(`Created ${n} codes`);
        }}
      />
      <AddDialog
        open={dialog === "add"}
        onClose={() => setDialog(null)}
        onDone={async (code) => {
          await reload();
          showToast(`Added ${code}`);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${selected.size} voucher${selected.size === 1 ? "" : "s"}?`}
        body="Deleted codes stop working straight away. Orders that already used them are not affected."
        confirmLabel="Delete"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await api("POST", "/api/admin/vouchers/delete", { codes: [...selected] });
          setSelected(new Set());
          await reload();
          showToast("Deleted");
        }}
      />
      {toast}
    </>
  );
}

function KindAmountFields({
  kind,
  amount,
  setKind,
  setAmount,
}: {
  kind: Kind;
  amount: string;
  setKind: (k: Kind) => void;
  setAmount: (a: string) => void;
}) {
  return (
    <Stack direction="row" spacing={2}>
      <TextField select label="Type" value={kind} onChange={(e) => setKind(e.target.value as Kind)} sx={{ minWidth: 170 }}>
        <MenuItem value="absolute">Dollars off (S$)</MenuItem>
        <MenuItem value="percent">Percent off (%)</MenuItem>
      </TextField>
      <TextField
        label={kind === "percent" ? "Percent off" : "Dollars off"}
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        slotProps={{ htmlInput: { min: 0, step: kind === "percent" ? 1 : 0.5 } }}
        fullWidth
      />
    </Stack>
  );
}

function GenerateDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (n: number) => Promise<void> }) {
  const [kind, setKind] = useState<Kind>("absolute");
  const [amount, setAmount] = useState("10");
  const [count, setCount] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = num(amount);
  const n = num(count);
  const valid = a > 0 && Number.isInteger(n) && n >= 1 && n <= 1000;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Generate voucher codes</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <KindAmountFields kind={kind} amount={amount} setKind={setKind} setAmount={setAmount} />
          <TextField label="How many" type="number" value={count} onChange={(e) => setCount(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 1000 } }} />
          <Typography variant="body2" color="text.secondary">
            Codes look like <code>LQNZDRKP{Number.isFinite(a) ? String(a).replace(".", "") : "10"}</code>: 8 random letters with no vowels, then the value.
          </Typography>
        </Stack>
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
            try {
              await api("POST", "/api/admin/vouchers/generate", { kind, amount: a, count: n });
              await onDone(n);
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Generating…" : `Generate ${valid ? n : ""}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AddDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (code: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<Kind>("absolute");
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = num(amount);
  const valid = /^[A-Za-z0-9]{3,40}$/.test(code.trim()) && a > 0;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add a voucher code</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            helperText="Letters and numbers only, e.g. WELCOME10"
            autoFocus
          />
          <KindAmountFields kind={kind} amount={amount} setKind={setKind} setAmount={setAmount} />
        </Stack>
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
            try {
              await api("POST", "/api/admin/vouchers", { code: code.trim(), kind, amount: a });
              await onDone(code.trim().toUpperCase());
              setCode("");
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}
