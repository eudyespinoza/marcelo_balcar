import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import { api } from "./lib/api";
import { clearOfflineData, pendingCount, syncOffline } from "./lib/offline";
import { useOperationsSocket } from "./hooks/useOperationsSocket";
import type { Session } from "./types";
import { Layout } from "./components/Layout";
import { BrandLogo } from "./components/BrandLogo";
import { LoginPage } from "./pages/LoginPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";

const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const OperationPage = lazy(() => import("./pages/OperationPage").then((module) => ({ default: module.OperationPage })));
const ClientsPage = lazy(() => import("./pages/ClientsPage").then((module) => ({ default: module.ClientsPage })));
const ClientDetailPage = lazy(() => import("./pages/ClientDetailPage").then((module) => ({ default: module.ClientDetailPage })));
const CalendarPage = lazy(() => import("./pages/CalendarPage").then((module) => ({ default: module.CalendarPage })));
const TechnicianPage = lazy(() => import("./pages/TechnicianPage").then((module) => ({ default: module.TechnicianPage })));
const CashPage = lazy(() => import("./pages/CashPage").then((module) => ({ default: module.CashPage })));
const SecurityPage = lazy(() => import("./pages/SecurityPage").then((module) => ({ default: module.SecurityPage })));
const IssuesPage = lazy(() => import("./pages/IssuesPage").then((module) => ({ default: module.IssuesPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));

function App() {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["session"], queryFn: () => api<Session>("/auth/session/"), retry: false
  });
  const [updateBlocked, setUpdateBlocked] = useState(false);
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) { registration && window.setInterval(() => void registration.update(), 60 * 60 * 1000); }
  });

  useOperationsSocket(Boolean(session.data));

  useEffect(() => {
    const syncRegistration = async () => {
      if (!("serviceWorker" in navigator)) return;
      const registration = await navigator.serviceWorker.ready;
      registration.addEventListener("updatefound", () => void 0);
    };
    void syncRegistration();
  }, []);

  useEffect(() => {
    const markDirty = (event: Event) => (event.target as HTMLElement | null)?.closest("form")?.setAttribute("data-dirty", "true");
    document.addEventListener("input", markDirty);
    document.addEventListener("change", markDirty);
    return () => { document.removeEventListener("input", markDirty); document.removeEventListener("change", markDirty); };
  }, []);

  const acceptUpdate = async () => {
    const pending = await pendingCount();
    const dirty = document.querySelector("form[data-dirty='true']");
    if (pending || dirty) { setUpdateBlocked(true); return; }
    await updateServiceWorker(true);
  };

  if (session.isPending) return <div className="boot-screen"><BrandLogo /><p>Preparando operaciones…</p></div>;
  if (session.isError) return <LoginPage onLogin={() => void session.refetch()} />;

  const user = session.data.user;
  if (user.must_change_password) return <ChangePasswordPage onChanged={() => void session.refetch()} />;
  const technicianOnly = user.is_technician;
  const canViewDelinquency = user.permissions.includes("operations.view_client_sensitive");
  const canManageSettings = user.permissions.includes("operations.change_applicationsettings");
  const logout = async () => {
    if (navigator.onLine) await syncOffline().catch(() => void 0);
    if (await pendingCount()) { alert("Hay trabajo sin sincronizar. Recuperá conexión antes de cerrar la sesión."); return; }
    await api("/auth/logout/", { method: "POST" }); await clearOfflineData(); queryClient.clear(); location.assign("/");
  };

  return <>
    <Layout user={user} vapidKey={session.data.vapid_public_key} onLogout={logout}>
      <Suspense fallback={<div className="page panel-loading">Preparando pantalla…</div>}>
      <Routes>
        <Route path="/" element={technicianOnly ? <Navigate to="/tecnico" replace /> : <OperationPage />} />
        <Route path="/dashboard" element={technicianOnly ? <Navigate to="/tecnico" replace /> : <DashboardPage />} />
        <Route path="/clientes" element={technicianOnly ? <Navigate to="/tecnico" replace /> : <ClientsPage canViewDelinquency={canViewDelinquency} />} />
        <Route path="/clientes/:id" element={<ClientDetailPage technician={technicianOnly} />} />
        <Route path="/calendario" element={technicianOnly ? <Navigate to="/tecnico" replace /> : <CalendarPage />} />
        <Route path="/tecnico" element={<TechnicianPage />} />
        <Route path="/caja" element={technicianOnly ? <Navigate to="/tecnico" replace /> : <CashPage />} />
        <Route path="/seguridad" element={technicianOnly ? <Navigate to="/tecnico" replace /> : <SecurityPage permissions={user.permissions} />} />
        <Route path="/incidencias" element={technicianOnly ? <Navigate to="/tecnico" replace /> : <IssuesPage />} />
        <Route path="/configuracion" element={!technicianOnly && canManageSettings ? <SettingsPage /> : <Navigate to={technicianOnly ? "/tecnico" : "/"} replace />} />
        <Route path="*" element={<Navigate to={technicianOnly ? "/tecnico" : "/"} replace />} />
      </Routes>
      </Suspense>
    </Layout>
    {needRefresh && <div className="update-toast"><strong>Nueva versión disponible</strong><span>{updateBlocked ? "Hay trabajo sin sincronizar. Actualizá cuando la cola esté vacía." : "Podés aplicarla sin perder tu sesión."}</span><div><button className="button ghost" onClick={() => setNeedRefresh(false)}>Más tarde</button><button className="button primary" onClick={() => void acceptUpdate()}>Actualizar</button></div></div>}
  </>;
}

export default App;
