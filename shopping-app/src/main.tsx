import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  LinearProgress,
} from "@mui/material";
import App from "./App";
import Gallery from "./pages/Gallery";
import StorePage from "./pages/StorePage";
import Checkout from "./pages/Checkout";
import Receipt from "./pages/Receipt";

// the dashboard is only downloaded by people who open /admin
const AdminRoot = lazy(() => import("./admin/AdminRoot"));

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Gallery /> },
      { path: "store/:id", element: <StorePage /> },
      { path: "checkout", element: <Checkout /> },
      { path: "receipt", element: <Receipt /> },
    ],
  },
  {
    path: "/admin/*",
    element: (
      <Suspense fallback={<LinearProgress />}>
        <AdminRoot />
      </Suspense>
    ),
  },
]);

const theme = createTheme({
  palette: { mode: "light", primary: { main: "#1976d2" } },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiCard: { styleOverrides: { root: { borderRadius: 16 } } },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>
);
