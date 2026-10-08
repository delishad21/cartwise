// src/admin/utils.tsx — non-component helpers shared by admin pages
import { useState, type ReactNode } from "react";
import { Alert, Snackbar } from "@mui/material";

/** Snackbar toast: const [toast, setToast] = useToast(); ... {toast} */
export function useToast(): [ReactNode, (msg: string, severity?: "success" | "error" | "info") => void] {
  const [state, setState] = useState<{ msg: string; severity: "success" | "error" | "info"; key: number } | null>(null);
  const node = (
    <Snackbar
      key={state?.key}
      open={!!state}
      autoHideDuration={state?.severity === "error" ? 6000 : 3000}
      onClose={() => setState(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      {state ? (
        <Alert severity={state.severity} variant="filled" onClose={() => setState(null)}>
          {state.msg}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
  return [node, (msg, severity = "success") => setState({ msg, severity, key: Date.now() })];
}

/** Parse a number input; empty string → NaN so validation can flag it. */
export const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
