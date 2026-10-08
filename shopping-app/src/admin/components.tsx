// src/admin/components.tsx — small building blocks shared by admin pages
import { useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ImageIcon from "@mui/icons-material/Image";
import type { StoreAlert } from "../lib/types";
import { uploadImage } from "./api";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} sx={{ mb: 2 }}>
      <Box sx={{ flex: 1 }}>
        <Typography variant="h5" fontWeight={800}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h4" fontWeight={800} sx={{ my: 0.5 }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Paper>
  );
}

/** Confirm a destructive action. `onConfirm` may be async; errors are shown inline. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  danger = true,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        <DialogContentText component="div">{body}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={danger ? "error" : "primary"}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Working…" : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Image preview with an upload button; value is the image URL. */
export function ImageField({
  label,
  value,
  onChange,
  aspect = "1 / 1",
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  aspect?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Box
        sx={{
          width: "100%",
          maxWidth: 260,
          aspectRatio: aspect,
          borderRadius: 2,
          border: "1px dashed",
          borderColor: "divider",
          bgcolor: "background.default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {value ? (
          <Box component="img" src={value} alt="" sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        ) : (
          <ImageIcon color="disabled" fontSize="large" />
        )}
      </Box>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            onChange(await uploadImage(file));
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="outlined" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? "Uploading…" : value ? "Replace image" : "Upload image"}
        </Button>
        {value && (
          <Button size="small" color="error" onClick={() => onChange("")} disabled={busy}>
            Remove
          </Button>
        )}
      </Stack>
      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
    </Stack>
  );
}

/** Edit a list of banner messages (site-wide or per store). */
export function AlertsEditor({ value, onChange }: { value: StoreAlert[]; onChange: (v: StoreAlert[]) => void }) {
  const set = (i: number, patch: Partial<StoreAlert>) =>
    onChange(value.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <Stack spacing={1.5}>
      {value.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No banners.
        </Typography>
      )}
      {value.map((a, i) => (
        <Stack key={i} direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "flex-start" }}>
          <TextField
            select
            size="small"
            label="Style"
            value={a.severity ?? "info"}
            onChange={(e) => set(i, { severity: e.target.value as StoreAlert["severity"] })}
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="info">Info (blue)</MenuItem>
            <MenuItem value="success">Success (green)</MenuItem>
            <MenuItem value="warning">Warning (orange)</MenuItem>
            <MenuItem value="error">Error (red)</MenuItem>
          </TextField>
          <TextField
            size="small"
            label="Message"
            value={a.message}
            onChange={(e) => set(i, { message: e.target.value })}
            fullWidth
            multiline
          />
          <IconButton aria-label="Remove banner" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <DeleteIcon />
          </IconButton>
        </Stack>
      ))}
      <Box>
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...value, { message: "", severity: "info" }])}>
          Add banner
        </Button>
      </Box>
    </Stack>
  );
}
