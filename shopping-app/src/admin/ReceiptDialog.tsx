// src/admin/ReceiptDialog.tsx — an order's receipt in a dialog, for students to
// present from (projector, shared screen, phone) or print / save as PDF.
import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  GlobalStyles,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import PrintIcon from "@mui/icons-material/Print";
import ReceiptView, { type ReceiptData } from "../components/ReceiptView";
import { groupLabel } from "../lib/format";
import type { AdminOrder } from "./api";

/** The receipt the student saw, rebuilt from the stored order. */
function orderReceipt(o: AdminOrder): ReceiptData {
  const p = (o.payload ?? {}) as Partial<AdminOrder["payload"]> & { breakdownSuppressed?: boolean };
  return {
    name: o.name,
    className: o.group,
    createdAt: o.createdAt,
    grandTotal: o.total,
    justifications: p.justifications ?? [],
    items: p.items ?? [],
    perStoreTotals: p.perStoreTotals ?? [],
    overallDiscounts: p.overallDiscounts,
    breakdownSuppressed: p.breakdownSuppressed,
  };
}

const ROOT = "cw-receipt-dialog";
const NO_PRINT = "cw-receipt-noprint";

// Print only the receipt: hide the admin page behind the dialog and the
// dialog's own chrome, and let the receipt flow over as many A4 pages as needed.
const printStyles = (
  <GlobalStyles
    styles={{
      "@media print": {
        "@page": { size: "A4", margin: "12mm" },
        "html, body": { overflow: "visible !important", height: "auto !important", background: "#fff" },
        [`body > *:not(.${ROOT})`]: { display: "none !important" },
        [`.${ROOT}`]: { position: "static !important" },
        [`.${ROOT} .MuiBackdrop-root, .${NO_PRINT}`]: { display: "none !important" },
        [`.${ROOT} .MuiDialog-container`]: { display: "block !important", height: "auto !important" },
        [`.${ROOT} .MuiDialog-paper`]: {
          margin: "0 !important",
          width: "auto !important",
          height: "auto !important",
          maxWidth: "none !important",
          maxHeight: "none !important",
          boxShadow: "none !important",
          borderRadius: "0 !important",
          overflow: "visible !important",
          background: "#fff !important",
        },
        [`.${ROOT} .MuiDialogContent-root`]: {
          display: "block !important",
          overflow: "visible !important",
          padding: "0 !important",
        },
        // the present layout is sized for a projector; bring it down to paper size
        [`.${ROOT} .cw-receipt`]: { zoom: 0.72 },
        [`.${ROOT} .MuiPaper-root`]: { boxShadow: "none !important" },
        [`.${ROOT} .cw-receipt-totals`]: { gridTemplateColumns: "repeat(3, 1fr) !important" },
        [`.${ROOT} .cw-receipt > .MuiPaper-root`]: { border: "1px solid #ddd" },
      },
    }}
  />
);

export default function ReceiptDialog({ order, onClose }: { order: AdminOrder | null; onClose: () => void }) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const [full, setFull] = useState(false);
  // keep showing the last order while the dialog fades out
  const [shown, setShown] = useState(order);
  if (order && order !== shown) setShown(order);

  useEffect(() => {
    if (!order) setFull(false);
  }, [order]);

  const print = () => {
    if (!shown) return;
    // the title becomes the PDF's file name in "Save as PDF"
    const title = document.title;
    document.title = `Receipt - ${groupLabel(shown.group)} - ${shown.name}`;
    window.addEventListener("afterprint", () => (document.title = title), { once: true });
    window.print();
  };

  return (
    <Dialog
      open={!!order}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      fullScreen={phone || full}
      className={ROOT}
      aria-labelledby="receipt-dialog-title"
      slotProps={{
        paper: {
          sx: {
            bgcolor: "grey.100",
            // md and up: near full screen, for the one-screen dashboard layout
            ...(!phone &&
              !full && {
                height: { sm: "92vh", md: "calc(100% - 24px)" },
                m: { md: 1.5 },
                width: { md: "calc(100% - 24px)" },
                maxWidth: { md: "none" },
                maxHeight: { md: "calc(100% - 24px)" },
              }),
          },
        },
      }}
    >
      {order && printStyles}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        className={NO_PRINT}
        sx={{
          px: { xs: 1.5, sm: 2.5 },
          py: 1,
          bgcolor: "background.paper",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography id="receipt-dialog-title" variant="subtitle1" fontWeight={700} sx={{ flex: 1, minWidth: 0 }} noWrap>
          {shown ? `Receipt · ${groupLabel(shown.group)} · ${shown.name}` : "Receipt"}
        </Typography>
        {!phone && (
          <Button
            onClick={() => setFull((f) => !f)}
            startIcon={full ? <FullscreenExitIcon /> : <FullscreenIcon />}
            color="inherit"
          >
            {full ? "Exit full screen" : "Full screen"}
          </Button>
        )}
        {phone ? (
          <Tooltip title="Print / Save as PDF">
            <IconButton onClick={print} aria-label="Print or save as PDF">
              <PrintIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <Button onClick={print} startIcon={<PrintIcon />} variant="outlined">
            Print / Save as PDF
          </Button>
        )}
        {phone ? (
          <IconButton onClick={onClose} aria-label="Close" edge="end">
            <CloseIcon />
          </IconButton>
        ) : (
          <Button onClick={onClose} startIcon={<CloseIcon />} variant="contained">
            Close
          </Button>
        )}
      </Stack>
      <DialogContent
        sx={{
          p: { xs: 1.5, sm: 3, md: 2 },
          // md and up the dashboard fills the dialog; only its panels scroll
          display: { md: "flex" },
          overflowY: { md: "hidden" },
        }}
      >
        {shown && (
          <Box sx={{ maxWidth: { xs: 1100, md: "none" }, width: { md: "100%" }, mx: "auto" }}>
            <ReceiptView receipt={orderReceipt(shown)} variant="present" voidedAt={shown.voidedAt} />
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
