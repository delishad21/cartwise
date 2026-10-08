// src/admin/pages/Printables.tsx — open print-ready sheets in a new tab
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Paper,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { useApi, voucherLabel, type AdminCard, type AdminVoucher, type Settings } from "../api";
import { PageHeader } from "../components";

const CARDS_PER_SHEET = 16;
const CODES_PER_PAGE = 20;

export default function Printables() {
  const { data: cards } = useApi<AdminCard[]>("/api/admin/cards");
  const { data: vouchers } = useApi<AdminVoucher[]>("/api/admin/vouchers");
  const { data: settings } = useApi<Settings>("/api/admin/settings");

  const [backups, setBackups] = useState(true);
  const [unusedOnly, setUnusedOnly] = useState(true);
  const [picked, setPicked] = useState<Set<string> | null>(null); // null = all values

  const values = useMemo(() => {
    const m = new Map<string, { kind: "percent" | "absolute"; amount: number; count: number }>();
    for (const v of vouchers ?? []) {
      if (unusedOnly && v.usedAt) continue;
      const k = `${v.kind}:${v.amount}`;
      const e = m.get(k) ?? { kind: v.kind, amount: v.amount, count: 0 };
      e.count++;
      m.set(k, e);
    }
    return [...m.entries()];
  }, [vouchers, unusedOnly]);

  const chosen = values.filter(([k]) => !picked || picked.has(k));
  const codeCount = chosen.reduce((a, [, v]) => a + v.count, 0);
  const rows = chosen.reduce((a, [, v]) => a + Math.ceil(v.count / (CODES_PER_PAGE / 2)), 0);

  const cardCount = cards?.length ?? 0;
  const sheetCount = backups ? Math.max(1, Math.ceil(cardCount / CARDS_PER_SHEET)) : Math.ceil(cardCount / CARDS_PER_SHEET);
  const blank = backups ? sheetCount * CARDS_PER_SHEET - cardCount : 0;

  const voucherUrl = `/api/admin/printables/vouchers?unused=${unusedOnly ? 1 : 0}${picked ? `&amounts=${encodeURIComponent([...picked].join(","))}` : ""}`;

  return (
    <>
      <PageHeader title="Printables" subtitle="Opens a print-ready page in a new tab. Print it, or choose “Save as PDF” as the printer." />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: "100%" }}>
            <Typography variant="h6" fontWeight={700}>
              Gift cards
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              16 cards per A4 sheet (landscape), sorted by group, with dashed cut lines.
            </Typography>
            <Box
              component="img"
              src="/print/giftcard-bg.jpg"
              alt="Gift card artwork"
              sx={{ width: "100%", maxWidth: 360, borderRadius: 2, boxShadow: 1, mb: 2 }}
            />
            <Stack spacing={1}>
              <Typography>
                <strong>{cardCount}</strong> card{cardCount === 1 ? "" : "s"}
                {blank > 0 && (
                  <>
                    {" "}
                    + <strong>{blank}</strong> blank backup{blank === 1 ? "" : "s"}
                  </>
                )}{" "}
                on <strong>{sheetCount}</strong> sheet{sheetCount === 1 ? "" : "s"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                From: <strong>{settings?.giftCardFrom || "(blank line)"}</strong> · Valid until:{" "}
                <strong>{settings?.giftCardValidUntil || "(not shown)"}</strong> · <Link to="/admin/settings">change</Link>
              </Typography>
              <FormControlLabel
                control={<Switch checked={backups} onChange={(e) => setBackups(e.target.checked)} />}
                label="Fill the last sheet with blank backup cards"
              />
              {blank > 0 && (
                <Alert severity="info">
                  Backups have no card number. To use one, add a card in <Link to="/admin/cards">Gift Cards</Link> and handwrite its number and group.
                </Alert>
              )}
            </Stack>
            <Button
              variant="contained"
              startIcon={<PrintIcon />}
              sx={{ mt: 2 }}
              disabled={!cardCount && !backups}
              href={`/api/admin/printables/gift-cards?backups=${backups ? 1 : 0}`}
              target="_blank"
            >
              Open gift card sheets
            </Button>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: "100%" }}>
            <Typography variant="h6" fontWeight={700}>
              Voucher tear-off strips
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Two rows per A4 page. Each row has a header showing the value, with 10 tear-off codes hanging below it.
            </Typography>
            <FormControlLabel
              control={<Switch checked={unusedOnly} onChange={(e) => setUnusedOnly(e.target.checked)} />}
              label="Only codes that haven't been used"
            />
            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              Values to print
            </Typography>
            {values.length === 0 && (
              <Typography color="text.secondary" variant="body2">
                No codes. Generate some in <Link to="/admin/vouchers">Vouchers</Link>.
              </Typography>
            )}
            <FormGroup>
              {values.map(([k, v]) => (
                <FormControlLabel
                  key={k}
                  control={
                    <Checkbox
                      checked={!picked || picked.has(k)}
                      onChange={(e) => {
                        const next = new Set(picked ?? values.map(([key]) => key));
                        if (e.target.checked) next.add(k);
                        else next.delete(k);
                        setPicked(next.size === values.length ? null : next);
                      }}
                    />
                  }
                  label={`${voucherLabel(v)} — ${v.count} code${v.count === 1 ? "" : "s"}`}
                />
              ))}
            </FormGroup>
            <Typography sx={{ mt: 1 }}>
              <strong>{codeCount}</strong> code{codeCount === 1 ? "" : "s"} on about <strong>{Math.ceil(rows / 2)}</strong> page
              {Math.ceil(rows / 2) === 1 ? "" : "s"}
            </Typography>
            <Button variant="contained" startIcon={<PrintIcon />} sx={{ mt: 2 }} disabled={codeCount === 0} href={voucherUrl} target="_blank">
              Open voucher sheets
            </Button>
          </Paper>
        </Grid>
      </Grid>

      <Alert severity="info" sx={{ mt: 2 }}>
        In the print dialog choose <strong>A4</strong>, scale <strong>100%</strong> (not “Fit to page”) and turn on <strong>Background graphics</strong>.
      </Alert>
    </>
  );
}
