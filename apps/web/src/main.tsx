import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { RunDetail } from "./pages/RunDetail";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="runs/:id" element={<RunDetail />} />
          <Route path="*" element={<p className="empty">Page not found.</p>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
