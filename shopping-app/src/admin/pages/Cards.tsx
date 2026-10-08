// src/admin/pages/Cards.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
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
import EditIcon from "@mui/icons-material/Edit";
import { money } from "../../lib/format";
import { api, spacedCard, useApi, type AdminCard, type Settings } from "../api";
import { ConfirmDialog, PageHeader } from "../components";
import { num, useToast } from "../utils";

export default function Cards() {
  const { data, error, reload } = useApi<AdminCard[]>("/api/admin/cards", 15_000);
  const { data: settings } = useApi<Settings>("/api/admin/settings");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AdminCard | "new" | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, showToast] = useToast();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/\s/g, "");
    return (data ?? []).filter((c) => !needle || c.number.includes(needle) || c.group.toLowerCase() === needle || `group${c.group}`.toLowerCase() === needle);
  }, [data, q]);

  const groups = settings?.classes ?? [];
  const withoutCard = groups.filter((g) => !(data ?? []).some((c) => c.group === g));
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.number));

  return (
    <>
      <PageHeader
        title="Gift Cards"
        subtitle="The balance goes down as a group spends. A card with a group can only be used by that group."
        actions={
          <>
            <Button variant="contained" startIcon={<AutoAwesomeIcon />} onClick={() => setGenerateOpen(true)}>
              Generate cards
            </Button>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setEditing("new")}>
              Add a card
            </Button>
            <Button variant="outlined" onClick={() => setBudgetOpen(true)}>
              Set budget for all
            </Button>
            <Button variant="outlined" startIcon={<DownloadIcon />} href="/api/admin/cards.csv">
              CSV
            </Button>
          </>
        }
      />

      {withoutCard.length > 0 && data && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {withoutCard.length} group{withoutCard.length === 1 ? " has" : "s have"} no card yet:{" "}
          {withoutCard.slice(0, 12).join(", ")}
          {withoutCard.length > 12 ? "…" : ""}
        </Alert>
      )}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }} alignItems={{ sm: "center" }}>
        <TextField size="small" label="Search number or group" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 260 }} />
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {rows.length} card{rows.length === 1 ? "" : "s"}
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
                    indeterminate={!allSelected && rows.some((r) => selected.has(r.number))}
                    onChange={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        rows.forEach((r) => (allSelected ? n.delete(r.number) : n.add(r.number)));
                        return n;
                      })
                    }
                  />
                </TableCell>
                <TableCell>Group</TableCell>
                <TableCell>Card number</TableCell>
                <TableCell align="right">Budget</TableCell>
                <TableCell align="right">Spent</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell align="right">Orders</TableCell>
                <TableCell width={56} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                      No cards.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((c) => (
                <TableRow key={c.number} hover selected={selected.has(c.number)}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selected.has(c.number)}
                      onChange={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(c.number)) n.delete(c.number);
                          else n.add(c.number);
                          return n;
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>{c.group ? <strong>Group {c.group}</strong> : <Typography variant="body2" color="text.secondary">Any group</Typography>}</TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15, whiteSpace: "nowrap" }}>{spacedCard(c.number)}</TableCell>
                  <TableCell align="right">{money(c.initialBalance)}</TableCell>
                  <TableCell align="right">{c.initialBalance > c.balance ? money(c.initialBalance - c.balance) : "—"}</TableCell>
                  <TableCell align="right">
                    <strong>{money(c.balance)}</strong>
                  </TableCell>
                  <TableCell align="right">{c.orders || "—"}</TableCell>
                  <TableCell>
                    <IconButton size="small" aria-label="Edit card" onClick={() => setEditing(c)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CardDialog
        card={editing}
        groups={groups}
        onClose={() => setEditing(null)}
        onDone={async (msg) => {
          await reload();
          showToast(msg);
        }}
      />
      <GenerateDialog
        open={generateOpen}
        freeGroups={withoutCard.length}
        onClose={() => setGenerateOpen(false)}
        onDone={async (msg) => {
          await reload();
          showToast(msg);
        }}
      />
      <BudgetDialog
        open={budgetOpen}
        count={data?.length ?? 0}
        onClose={() => setBudgetOpen(false)}
        onDone={async () => {
          await reload();
          showToast("Budget updated on every card");
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${selected.size} card${selected.size === 1 ? "" : "s"}?`}
        body="Deleted cards stop working straight away. Their past orders are kept."
        confirmLabel="Delete"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await api("POST", "/api/admin/cards/delete", { numbers: [...selected] });
          setSelected(new Set());
          await reload();
          showToast("Deleted");
        }}
      />
      {toast}
    </>
  );
}

function GroupField({ value, onChange, groups }: { value: string; onChange: (v: string) => void; groups: string[] }) {
  return (
    <TextField select label="Group" value={value} onChange={(e) => onChange(e.target.value)} fullWidth helperText="Only this group can pay with the card">
      <MenuItem value="">Any group</MenuItem>
      {(value && !groups.includes(value) ? [value, ...groups] : groups).map((g) => (
        <MenuItem key={g} value={g}>
          Group {g}
        </MenuItem>
      ))}
    </TextField>
  );
}

function CardDialog({
  card,
  groups,
  onClose,
  onDone,
}: {
  card: AdminCard | "new" | null;
  groups: string[];
  onClose: () => void;
  onDone: (msg: string) => Promise<void>;
}) {
  const isNew = card === "new";
  const [number, setNumber] = useState("");
  const [group, setGroup] = useState("");
  const [initial, setInitial] = useState("");
  const [balance, setBalance] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!card) return;
    setError(null);
    if (card === "new") {
      setNumber("");
      setGroup("");
      setInitial("1300");
      setBalance("");
    } else {
      setNumber(card.number);
      setGroup(card.group);
      setInitial(String(card.initialBalance));
      setBalance(String(card.balance));
    }
  }, [card]);

  const valid = num(initial) >= 0 && (isNew || num(balance) >= 0) && (!number.trim() || /^(\d\s*){6,24}$/.test(number.trim()));

  return (
    <Dialog open={!!card} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isNew ? "Add a gift card" : `Card ${spacedCard(number)}`}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {isNew && (
            <TextField
              label="Card number (optional)"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              helperText="Leave blank to generate one, e.g. for a handwritten backup card"
            />
          )}
          <GroupField value={group} onChange={setGroup} groups={groups} />
          <TextField label="Budget (starting balance)" type="number" value={initial} onChange={(e) => setInitial(e.target.value)} slotProps={{ htmlInput: { min: 0, step: 50 } }} />
          {!isNew && (
            <TextField label="Current balance" type="number" value={balance} onChange={(e) => setBalance(e.target.value)} slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
          )}
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
              if (isNew) {
                const r = await api<{ number: string }>("POST", "/api/admin/cards", {
                  number: number.trim() || undefined,
                  group,
                  balance: num(initial),
                });
                await onDone(`Added card ${spacedCard(r.number)}`);
              } else {
                await api("PATCH", `/api/admin/cards/${card!.number}`, { group, initialBalance: num(initial), balance: num(balance) });
                await onDone("Card saved");
              }
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {isNew ? "Add card" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function GenerateDialog({ open, freeGroups, onClose, onDone }: { open: boolean; freeGroups: number; onClose: () => void; onDone: (msg: string) => Promise<void> }) {
  const [count, setCount] = useState("");
  const [balance, setBalance] = useState("1300");
  const [assign, setAssign] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setCount(String(freeGroups || 1));
  }, [open, freeGroups]);

  const n = num(count);
  const valid = Number.isInteger(n) && n >= 1 && n <= 1000 && num(balance) >= 0;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Generate gift cards</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="How many" type="number" value={count} onChange={(e) => setCount(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 1000 } }} />
          <TextField label="Budget on each card (S$)" type="number" value={balance} onChange={(e) => setBalance(e.target.value)} slotProps={{ htmlInput: { min: 0, step: 50 } }} />
          <FormControlLabel
            control={<Checkbox checked={assign} onChange={(e) => setAssign(e.target.checked)} />}
            label={`Assign to groups without a card (${freeGroups} waiting)`}
          />
          <Typography variant="body2" color="text.secondary">
            Numbers look like 7777 0123 4567. Change the list of groups in Settings.
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
              const r = await api<{ created: number; assigned: number }>("POST", "/api/admin/cards/generate", { count: n, balance: num(balance), assignGroups: assign });
              await onDone(`Created ${r.created} cards${r.assigned ? `, ${r.assigned} assigned to groups` : ""}`);
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Generate
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function BudgetDialog({ open, count, onClose, onDone }: { open: boolean; count: number; onClose: () => void; onDone: () => Promise<void> }) {
  const [balance, setBalance] = useState("1300");
  return (
    <ConfirmDialog
      open={open}
      danger={false}
      title="Set the budget on every card"
      body={
        <Stack spacing={2} sx={{ pt: 1 }}>
          <span>
            All {count} cards get this budget, and their balance is <strong>refilled</strong> to it. Use this before a lesson, not during one.
          </span>
          <TextField label="Budget (S$)" type="number" value={balance} onChange={(e) => setBalance(e.target.value)} slotProps={{ htmlInput: { min: 0, step: 50 } }} />
        </Stack>
      }
      confirmLabel="Set budget"
      onClose={onClose}
      onConfirm={async () => {
        if (!(num(balance) >= 0)) throw new Error("Enter a budget");
        await api("POST", "/api/admin/cards/set-budget", { balance: num(balance) });
        await onDone();
      }}
    />
  );
}
