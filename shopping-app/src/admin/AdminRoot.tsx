// src/admin/AdminRoot.tsx — password gate + layout for /admin
import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import StorefrontIcon from "@mui/icons-material/Storefront";
import { api, UNAUTHORISED_EVENT } from "./api";
import { useStoresList } from "../lib/useStores";
import Overview from "./pages/Overview";
import Orders from "./pages/Orders";
import Vouchers from "./pages/Vouchers";
import Cards from "./pages/Cards";
import Stores from "./pages/Stores";
import StoreEditor from "./pages/StoreEditor";
import Printables from "./pages/Printables";
import SettingsPage from "./pages/Settings";

const TABS = [
  { path: "", label: "Overview" },
  { path: "orders", label: "Orders" },
  { path: "vouchers", label: "Vouchers" },
  { path: "cards", label: "Gift Cards" },
  { path: "stores", label: "Stores & Items" },
  { path: "printables", label: "Printables" },
  { path: "settings", label: "Settings" },
];

type Session = { enabled: boolean; loggedIn: boolean };

export default function AdminRoot() {
  const [session, setSession] = useState<Session | null>(null);
  const { siteTitle } = useStoresList();

  useEffect(() => {
    api<Session>("GET", "/api/admin/me").then(setSession, () => setSession({ enabled: true, loggedIn: false }));
    const onUnauthorised = () => setSession((s) => (s ? { ...s, loggedIn: false } : s));
    window.addEventListener(UNAUTHORISED_EVENT, onUnauthorised);
    return () => window.removeEventListener(UNAUTHORISED_EVENT, onUnauthorised);
  }, []);

  useEffect(() => {
    document.title = `Admin · ${siteTitle}`;
  }, [siteTitle]);

  if (!session) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!session.loggedIn) {
    return <Login siteTitle={siteTitle} enabled={session.enabled} onLoggedIn={() => setSession({ enabled: true, loggedIn: true })} />;
  }

  return (
    <Shell
      siteTitle={siteTitle}
      onLogout={async () => {
        await api("POST", "/api/admin/logout").catch(() => {});
        setSession({ enabled: true, loggedIn: false });
      }}
    />
  );
}

function Shell({ siteTitle, onLogout }: { siteTitle: string; onLogout: () => void }) {
  const loc = useLocation();
  const nav = useNavigate();
  const section = loc.pathname.replace(/^\/admin\/?/, "").split("/")[0];
  const tab = TABS.some((t) => t.path === section) ? section : false;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh", bgcolor: "#f6f7f9" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 1 }}>
          <Typography
            variant="h6"
            sx={{ flexGrow: 1, minWidth: 0 }}
            noWrap
            component={Link}
            to="/admin"
            style={{ color: "inherit", textDecoration: "none" }}
          >
            {siteTitle} · Admin
          </Typography>
          <Button color="inherit" startIcon={<StorefrontIcon />} component={Link} to="/" sx={{ textTransform: "none" }}>
            View shop
          </Button>
          <Button color="inherit" onClick={onLogout} sx={{ textTransform: "none" }}>
            Log out
          </Button>
        </Toolbar>
        <Tabs
          value={tab}
          onChange={(_, v) => nav(`/admin/${v}`)}
          variant="scrollable"
          scrollButtons
          allowScrollButtonsMobile
          textColor="inherit"
          sx={{
            px: 1,
            "& .MuiTab-root": { color: "rgba(255,255,255,0.75)", textTransform: "none", minHeight: 48 },
            "& .Mui-selected": { color: "#fff" },
          }}
        >
          {TABS.map((t) => (
            <Tab key={t.path} label={t.label} value={t.path} disableRipple />
          ))}
        </Tabs>
      </AppBar>

      <Box component="main" sx={{ flex: 1, p: { xs: 2, md: 3 }, width: "100%", maxWidth: 1400, mx: "auto" }}>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="orders" element={<Orders />} />
          <Route path="vouchers" element={<Vouchers />} />
          <Route path="cards" element={<Cards />} />
          <Route path="stores" element={<Stores />} />
          <Route path="stores/:id" element={<StoreEditor />} />
          <Route path="printables" element={<Printables />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Box>
    </Box>
  );
}

function Login({ siteTitle, enabled, onLoggedIn }: { siteTitle: string; enabled: boolean; onLoggedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "#f6f7f9", p: 2 }}>
      <Paper
        component="form"
        sx={{ p: 4, width: "100%", maxWidth: 380, borderRadius: 4 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api("POST", "/api/admin/login", { password });
            onLoggedIn();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Stack spacing={2} alignItems="center">
          <Box sx={{ bgcolor: "primary.main", color: "#fff", borderRadius: "50%", p: 1.5, display: "flex" }}>
            <LockIcon />
          </Box>
          <Box textAlign="center">
            <Typography variant="h6" fontWeight={800}>
              {siteTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Teacher dashboard
            </Typography>
          </Box>
          {!enabled && (
            <Alert severity="warning" sx={{ width: "100%" }}>
              The dashboard is switched off. Set <code>ADMIN_PASSWORD</code> on the server and restart it.
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ width: "100%" }}>
              {error}
            </Alert>
          )}
          <TextField
            type="password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            fullWidth
            disabled={!enabled}
          />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={busy || !enabled || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <Button component={Link} to="/" size="small" sx={{ textTransform: "none" }}>
            Back to the shop
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
