import type { ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CircleDollarSign, Receipt, TrendingUp, UserCog, Users, Wallet, Wrench } from "lucide-react";
import { api } from "../lib/api";
import { currency, TZ } from "../lib/format";
import type { DashboardData, ServiceStatus } from "../types";
import { BarRanking, TrendChart, type BarDatum } from "../components/DashboardCharts";

const statusColors: Record<ServiceStatus, string> = {
  PENDING: "#777268", ASSIGNED: "#3977a2", IN_PROGRESS: "#e45a18", COMPLETED: "#288067", CANCELLED: "#a44b43"
};

export function DashboardPage() {
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: () => api<DashboardData>("/dashboard/today/"), refetchInterval: 60_000 });
  const now = new Date();
  const data = dashboard.data;
  const delinquencyRate = data?.overview.clients_total ? data.overview.delinquent_clients / data.overview.clients_total * 100 : 0;
  const serviceTrend = data?.service_trend.map((item) => ({ label: shortDate(item.date), values: { scheduled: item.scheduled, completed: item.completed, cancelled: item.cancelled } })) ?? [];
  const revenueTrend = data?.revenue_trend.map((item) => ({ label: shortMonth(item.month), values: { collected: Number(item.collected) } })) ?? [];
  const statusData: BarDatum[] = data?.status_breakdown.map((item) => ({ label: item.label, value: item.count, color: statusColors[item.status] })) ?? [];
  const workloadData: BarDatum[] = data?.technician_workload.map((item) => ({ label: item.name, value: item.total, meta: `${item.open} abiertos · ${item.completed} finalizados`, color: "#245f89" })) ?? [];
  const paymentData: BarDatum[] = data?.payment_methods.map((item) => ({ label: item.name, value: Number(item.total), displayValue: currency(item.total), meta: `${item.count} movimientos`, color: "#167455" })) ?? [];

  return <div className="page dashboard-page">
    <header className="page-header"><div><p className="eyebrow">PANEL GENERAL</p><h1>Resumen del negocio</h1><p>{new Intl.DateTimeFormat("es-AR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now)}</p></div><div className="live-indicator"><span /> Actualización en vivo</div></header>

    {dashboard.isPending && <div className="dashboard-skeleton" aria-label="Cargando indicadores"><i /><i /><i /><i /><i /><i /></div>}
    {dashboard.isError && <div className="inline-alert danger">No se pudo cargar el tablero. Verificá la conexión y tus permisos.</div>}

    {data && <>
      <section className="dashboard-kpis" aria-label="Indicadores principales">
        <KpiCard icon={Users} label="Clientes activos" value={data.overview.clients_total.toLocaleString("es-AR")} hint={`${data.overview.delinquent_clients} en mora`} />
        <KpiCard icon={AlertTriangle} label="Clientes en mora" value={data.overview.delinquent_clients.toLocaleString("es-AR")} hint={`${delinquencyRate.toFixed(1)}% de la cartera`} tone={data.overview.delinquent_clients ? "danger" : "success"} />
        <KpiCard icon={UserCog} label="Usuarios activos" value={data.overview.active_users.toLocaleString("es-AR")} hint={`${data.overview.active_technicians} técnicos activos`} />
        <KpiCard icon={Wrench} label="Servicios registrados" value={data.overview.services_total.toLocaleString("es-AR")} hint={`${data.overview.completion_rate.toFixed(1)}% finalizados`} />
        {data.finance && <>
          <KpiCard icon={Receipt} label="Total facturado" value={currency(data.finance.billed_total)} hint="Servicios con importe" tone="dark" />
          <KpiCard icon={CircleDollarSign} label="Total cobrado" value={currency(data.finance.collected_total)} hint={`${data.finance.collection_rate.toFixed(1)}% recuperado`} tone="success" />
          <KpiCard icon={Wallet} label="Saldo pendiente" value={currency(data.finance.outstanding_total)} hint={`${currency(data.finance.delinquent_balance)} en clientes morosos`} tone="warning" />
          <KpiCard icon={TrendingUp} label="Cobrado este mes" value={currency(data.finance.collected_this_month)} hint="Ingresos no anulados" />
        </>}
      </section>

      <section className="dashboard-insights">
        <article className="insight-card insight-wide"><InsightHeader eyebrow="SERVICIOS POR DÍA" title="Volumen de los últimos 14 días" detail="Programados, finalizados y cancelados" /><TrendChart ariaLabel="Servicios programados, finalizados y cancelados por día durante los últimos 14 días" data={serviceTrend} series={[
          { key: "scheduled", label: "Programados", color: "#245f89" },
          { key: "completed", label: "Finalizados", color: "#167455" },
          { key: "cancelled", label: "Cancelados", color: "#a44b43", dashed: true },
        ]} /></article>
        <article className="insight-card"><InsightHeader eyebrow="ESTADO GLOBAL" title="Distribución de servicios" detail={`${data.overview.unassigned_services} sin asignar · ${data.overview.unscheduled_services} sin fecha`} /><BarRanking ariaLabel="Cantidad total de servicios por estado" data={statusData} /></article>

        {data.finance && <article className="insight-card insight-wide"><InsightHeader eyebrow="INGRESOS" title="Cobranza de los últimos 6 meses" detail={`Tasa de cobranza ${data.finance.collection_rate.toFixed(1)}%`} /><TrendChart ariaLabel="Importe cobrado por mes durante los últimos 6 meses" data={revenueTrend} series={[{ key: "collected", label: "Cobrado", color: "#167455", format: currency }]} /></article>}
        {data.finance && <article className="insight-card"><InsightHeader eyebrow="COBRANZA" title="Medios de pago" detail="Totales acumulados vigentes" /><BarRanking ariaLabel="Importe cobrado por medio de pago" data={paymentData} /></article>}

        <article className="insight-card insight-full"><InsightHeader eyebrow="EQUIPO" title="Carga por técnico" detail="Servicios abiertos y finalizados por responsable" /><BarRanking ariaLabel="Cantidad de servicios por técnico" data={workloadData} /></article>
      </section>

    </>}
  </div>;
}

function KpiCard({ icon: Icon, label, value, hint, tone = "default" }: { icon: ComponentType; label: string; value: string; hint: string; tone?: "default" | "danger" | "success" | "warning" | "dark" }) {
  return <article className={`dashboard-kpi kpi-${tone}`}><span><Icon /></span><div><small>{label}</small><strong>{value}</strong><p>{hint}</p></div></article>;
}

function InsightHeader({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <header className="insight-header"><div><p>{eyebrow}</p><h2>{title}</h2></div><span>{detail}</span></header>;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)).replace(".", "");
}

function shortMonth(value: string) {
  return new Intl.DateTimeFormat("es-AR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)).replace(".", "");
}
