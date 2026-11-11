import { useEffect, useState } from "react";
import { Paper, Typography } from "@mui/material";
import ReceiptView, { type ReceiptData } from "../components/ReceiptView";

export default function Receipt() {
  const [payload, setPayload] = useState<ReceiptData | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("last-order");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as ReceiptData;
        setPayload(parsed);
      } catch {
        // ignore
      }
      localStorage.removeItem("last-order");
    }
  }, []);

  if (!payload) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={700}>
          No recent order found
        </Typography>
        <Typography color="text.secondary">
          Make a purchase to see a receipt here.
        </Typography>
      </Paper>
    );
  }

  return <ReceiptView receipt={payload} />;
}
