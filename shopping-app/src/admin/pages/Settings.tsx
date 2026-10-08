// src/admin/pages/Settings.tsx — site-wide settings
import { useEffect, useState } from "react";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Button,
  InputAdornment,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api, useApi, type Settings } from "../api";
import { AlertsEditor, PageHeader } from "../components";
import { num, useToast } from "../utils";

type Form = {
  title: string;
  gstPct: string;
  percentMax: string;
  absoluteMax: string;
  groupsText: string;
  alerts: Settings["alerts"];
  giftCardFrom: string;
  giftCardValidUntil: string;
};

const toForm = (s: Settings): Form => ({
  title: s.title,
  gstPct: String(Math.round(s.gst * 10000) / 100),
  percentMax: s.discountCap?.percentMax != null ? String(s.discountCap.percentMax) : "",
  absoluteMax: s.discountCap?.absoluteMax != null ? String(s.discountCap.absoluteMax) : "",
  groupsText: s.classes.join("\n"),
  alerts: s.alerts,
  giftCardFrom: s.giftCardFrom,
  giftCardValidUntil: s.giftCardValidUntil,
});

const parseGroups = (t: string) => [...new Set(t.split(/\n|,/).map((g) => g.trim()).filter(Boolean))];

export default function SettingsPage() {
  const { data, error, reload } = useApi<Settings>("/api/admin/settings");
  const [form, setForm] = useState<Form | null>(null);
  const [groupCount, setGroupCount] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!form) return <LinearProgress />;

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const groups = parseGroups(form.groupsText);
  const gst = num(form.gstPct);
  const pMax = form.percentMax.trim() ? num(form.percentMax) : undefined;
  const aMax = form.absoluteMax.trim() ? num(form.absoluteMax) : undefined;
  const invalid =
    !form.title.trim() ||
    !(gst >= 0 && gst <= 100) ||
    (pMax !== undefined && !(pMax >= 0 && pMax <= 100)) ||
    (aMax !== undefined && !(aMax >= 0));

  return (
    <>
      <PageHeader title="Settings" />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Shop
            </Typography>
            <Stack spacing={2}>
              <TextField label="Shop name" value={form.title} onChange={(e) => set({ title: e.target.value })} />
              <TextField
                label="GST"
                type="number"
                value={form.gstPct}
                onChange={(e) => set({ gstPct: e.target.value })}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { min: 0, max: 100, step: 0.5 } }}
                helperText="Charged on items only, not shipping"
              />
              <Typography variant="subtitle2">Most a single order can save with vouchers</Typography>
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Max dollars off"
                  type="number"
                  value={form.absoluteMax}
                  onChange={(e) => set({ absoluteMax: e.target.value })}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start">S$</InputAdornment> } }}
                  helperText="Blank = no limit"
                  fullWidth
                />
                <TextField
                  label="Max percent off"
                  type="number"
                  value={form.percentMax}
                  onChange={(e) => set({ percentMax: e.target.value })}
                  slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                  helperText="Of the order total"
                  fullWidth
                />
              </Stack>
            </Stack>
          </Paper>

          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Gift card printing
            </Typography>
            <Stack spacing={2}>
              <TextField label="From" value={form.giftCardFrom} onChange={(e) => set({ giftCardFrom: e.target.value })} helperText="Leave blank for a line to write on" />
              <TextField label="Valid until" value={form.giftCardValidUntil} onChange={(e) => set({ giftCardValidUntil: e.target.value })} placeholder="31 December 2026" helperText="Leave blank to hide" />
            </Stack>
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Home page banners
            </Typography>
            <AlertsEditor value={form.alerts} onChange={(alerts) => set({ alerts })} />
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={700}>
              Groups ({groups.length})
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Students pick their group at checkout. One per line.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <TextField size="small" label="Number of groups" type="number" value={groupCount} onChange={(e) => setGroupCount(e.target.value)} sx={{ width: 170 }} />
              <Button
                variant="outlined"
                disabled={!(num(groupCount) >= 1 && num(groupCount) <= 500)}
                onClick={() => set({ groupsText: Array.from({ length: num(groupCount) }, (_, i) => String(i + 1)).join("\n") })}
              >
                Make groups 1 to {num(groupCount) >= 1 ? num(groupCount) : "N"}
              </Button>
            </Stack>
            <TextField
              label="Groups"
              value={form.groupsText}
              onChange={(e) => set({ groupsText: e.target.value })}
              multiline
              minRows={10}
              maxRows={22}
              fullWidth
            />
          </Paper>
        </Grid>
      </Grid>

      {saveError && <Alert severity="error" sx={{ mt: 2 }}>{saveError}</Alert>}
      <Stack direction="row" spacing={1} sx={{ mt: 2, position: "sticky", bottom: 16 }}>
        <Button
          variant="contained"
          size="large"
          disabled={invalid || saving}
          onClick={async () => {
            setSaving(true);
            setSaveError(null);
            try {
              const cap = pMax === undefined && aMax === undefined ? null : { percentMax: pMax, absoluteMax: aMax };
              await api("PUT", "/api/admin/settings", {
                title: form.title.trim(),
                gst: gst / 100,
                classes: groups,
                alerts: form.alerts.filter((a) => a.message.trim()),
                discountCap: cap,
                giftCardFrom: form.giftCardFrom.trim(),
                giftCardValidUntil: form.giftCardValidUntil.trim(),
              });
              await reload();
              showToast("Settings saved");
            } catch (e) {
              setSaveError((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save settings"}
        </Button>
        <Button size="large" onClick={() => data && setForm(toForm(data))} disabled={saving} sx={{ bgcolor: "background.paper" }}>
          Undo changes
        </Button>
      </Stack>
      {toast}
    </>
  );
}
