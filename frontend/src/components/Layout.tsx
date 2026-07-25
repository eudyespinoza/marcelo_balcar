import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Activity, AlertTriangle, BellRing, CalendarDays, CircleDollarSign, CloudOff, LayoutDashboard, LogOut, Menu, Search, Settings2, ShieldCheck, UserRoundCog, Wifi, X } from "lucide-react";
import type { User } from "../types";
import { initials } from "../lib/format";
import { pendingCount, syncOffline } from "../lib/offline";
import { api } from "../lib/api";
import { BrandLogo } from "./BrandLogo";

const adminNav = [
  { to: "/", label: "Operación", icon: Activity, permissions: ["operations.view_dashboard"] },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permissions: ["operations.view_dashboard"] },
  { to: "/clientes", label: "Clientes", icon: Search, permissions: ["operations.view_client"] },
  { to: "/calendario", label: "Agenda", icon: CalendarDays, permissions: ["operations.view_service"] },
  { to: "/caja", label: "Caja", icon: CircleDollarSign, permissions: ["operations.view_daily_cash"] },
  { to: "/incidencias", label: "Incidencias", icon: AlertTriangle, permissions: ["operations.view_dataissue", "operations.view_syncconflict"] },
  { to: "/seguridad", label: "Seguridad", icon: ShieldCheck, permissions: ["operations.manage_users", "operations.manage_roles"] },
  { to: "/configuracion", label: "Configuración", icon: Settings2, permissions: ["operations.change_applicationsettings"] }
];
const technicianNav = { to: "/tecnico", label: "Mis servicios", icon: UserRoundCog };

export function navigationForUser(user: Pick<User, "roles" | "permissions" | "is_technician">) {
  if (user.is_technician) return [technicianNav];

  const permittedAdminLinks = adminNav.filter((item) => item.permissions.some((permission) => user.permissions.includes(permission)));
  return permittedAdminLinks;
}

export function mobileNavigationGroups<T>(links: T[]) {
  return links.length <= 5
    ? { primary: links, overflow: [] as T[] }
    : { primary: links.slice(0, 4), overflow: links.slice(4) };
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function Layout({ user, vapidKey, onLogout, children }: { user: User; vapidKey?: string; onLogout: () => void; children: ReactNode }) {
  const links = navigationForUser(user);
  const location = useLocation();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(typeof Notification === "undefined" ? "denied" : Notification.permission);
  const mobileLinks = mobileNavigationGroups(links);
  const overflowActive = mobileLinks.overflow.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));

  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); void pendingCount().then(setPending); };
    const sync = () => { update(); void syncOffline().then(update).catch(update); };
    update();
    addEventListener("online", sync); addEventListener("offline", update); addEventListener("mb-outbox-change", update);
    return () => { removeEventListener("online", sync); removeEventListener("offline", update); removeEventListener("mb-outbox-change", update); };
  }, []);

  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileMenuOpen(false); };
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, [mobileMenuOpen]);

  const enableNotifications = async () => {
    if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const permission = await Notification.requestPermission(); setNotificationPermission(permission);
    if (permission !== "granted") return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
    const json = subscription.toJSON();
    await api("/push-subscriptions/", { method: "POST", body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, user_agent: navigator.userAgent, active: true }) });
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><BrandLogo /><div><small>Centro de operaciones</small></div></div>
      <nav>{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === "/"}><Icon /> <span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-foot">
        {vapidKey && notificationPermission === "default" && <button className="notify-opt-in" onClick={() => void enableNotifications()}><BellRing /> Activar avisos</button>}
        <div className={`connectivity ${online ? "online" : "offline"}`}>{online ? <Wifi /> : <CloudOff />}<span>{online ? pending ? `Sincronizando ${pending}` : "En línea" : `${pending} pendientes`}</span></div>
        <div className="user-chip"><span>{initials(`${user.first_name} ${user.last_name}` || user.username)}</span><div><strong>{user.first_name || user.username}</strong><small>{user.roles[0] ?? "Usuario"}</small></div><button onClick={onLogout} aria-label="Cerrar sesión"><LogOut /></button></div>
      </div>
    </aside>
    <header className="mobile-top"><div className="brand"><BrandLogo /><strong>OPERACIONES</strong></div><div className="mobile-session"><span className={`network-dot ${online ? "online" : "offline"}`} title={online ? "En línea" : "Sin conexión"} /><button onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut /></button></div></header>
    <main key={location.pathname}>{children}</main>
    {mobileMenuOpen && <div className="mobile-more-backdrop" onClick={() => setMobileMenuOpen(false)}><section id="mobile-more-menu" className="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="Más secciones" onClick={(event) => event.stopPropagation()}><header><div><small>NAVEGACIÓN</small><strong>Más secciones</strong></div><button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Cerrar menú"><X /></button></header><nav>{mobileLinks.overflow.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to}><Icon /><span>{label}</span></NavLink>)}</nav></section></div>}
    <nav className="bottom-nav" style={{ gridTemplateColumns: `repeat(${mobileLinks.primary.length + (mobileLinks.overflow.length ? 1 : 0)}, 1fr)` }}>{mobileLinks.primary.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === "/"}><Icon /><span>{label}</span></NavLink>)}{mobileLinks.overflow.length > 0 && <button type="button" className={overflowActive ? "active" : ""} onClick={() => setMobileMenuOpen(true)} aria-expanded={mobileMenuOpen} aria-controls="mobile-more-menu"><Menu /><span>Más</span></button>}</nav>
  </div>;
}
