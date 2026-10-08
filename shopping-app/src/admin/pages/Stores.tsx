// src/admin/pages/Stores.tsx — list of stores
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardActions,
  CardContent,
  CardMedia,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import StorefrontIcon from "@mui/icons-material/Storefront";
import { api, useApi, type AdminStore } from "../api";
import { PageHeader } from "../components";
import { slugify } from "../utils";

export default function Stores() {
  const { data, error, reload } = useApi<AdminStore[]>("/api/admin/stores");
  const [addOpen, setAddOpen] = useState(false);

  const move = async (i: number, dir: -1 | 1) => {
    if (!data) return;
    const ids = data.map((s) => s.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    await api("POST", "/api/admin/stores/reorder", { ids });
    await reload();
  };

  return (
    <>
      <PageHeader
        title="Stores & Items"
        subtitle="Changes show up in the shop when students next load a page."
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            Add store
          </Button>
        }
      />
      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && <LinearProgress />}

      <Grid container spacing={2}>
        {data?.map((s, i) => (
          <Grid key={s.id} size={{ xs: 12, sm: 6, lg: 4 }}>
            <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <CardActionArea component={Link} to={`/admin/stores/${s.id}`} sx={{ flex: 1 }}>
                {s.cover ? (
                  <CardMedia component="img" image={s.cover} alt={s.name} sx={{ aspectRatio: "16/9", objectFit: "cover" }} />
                ) : (
                  <Box sx={{ aspectRatio: "16/9", display: "grid", placeItems: "center", bgcolor: "action.hover" }}>
                    <StorefrontIcon color="disabled" sx={{ fontSize: 48 }} />
                  </Box>
                )}
                <CardContent>
                  <Typography variant="h6">{s.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {s.products.length} item{s.products.length === 1 ? "" : "s"} · shipping S${s.shipping.baseFee}
                    {s.discounts.length ? ` · ${s.discounts.length} discount rule${s.discounts.length === 1 ? "" : "s"}` : ""}
                  </Typography>
                </CardContent>
              </CardActionArea>
              <CardActions>
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1, pl: 1 }}>
                  Tab order
                </Typography>
                <IconButton size="small" aria-label="Move left" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowBackIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" aria-label="Move right" disabled={i === data.length - 1} onClick={() => move(i, 1)}>
                  <ArrowForwardIcon fontSize="small" />
                </IconButton>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      <AddStoreDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}

function AddStoreDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = slugify(name);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add a store</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Store name" value={name} onChange={(e) => setName(e.target.value)} autoFocus helperText={id ? `Address: /store/${id}` : " "} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!id || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api("POST", "/api/admin/stores", { id, name: name.trim() });
              nav(`/admin/stores/${id}`);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
