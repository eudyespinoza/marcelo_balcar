import { useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CircleDollarSign, Receipt, TrendingUp, UserCog, Users, Wallet, Wrench } from "lucide-react";
import { api } from "../lib/api";
import { dashboardPresetRange, type DashboardRangePreset } from "../lib/dashboardRange";
import { currency, TZ } from "../lib/format";
import type { DashboardData, ServiceStatus } from "../types";
import { BarRanking, TrendChart, type BarDatum } from "../components/DashboardCharts";

const statusColors: Record<ServiceStatus, string> = {
  PENDING: "#777268", ASSIGNED: "#3977a2", IN_PROGRESS: "#e45a18", COMPLETED: "#288067", CANCELLED: "#a44b43"
};

export function DashboardPage() {
  const [preset, setPreset] = useState<DashboardRangePreset>("month");
  const [range, setRange] = useState(() => dashboardPresetRange("month"));
  const validRange = range.start <= range.end;
  const dashboard = useQuery({
    queryKey: ["dashboard", range.start, range.end],
    queryFn: () => api<DashboardData>(`/dashboard/today/?start_date=${range.start}&end_date=${range.end}`),
    enabled: validRange,
    placeholderData: (previous) => previous,
    refetchInterval: 60_000
  });
  const now = new Date();
  const data = dashboard.data;
  const delinquencyRate = data?.overview.clients_total ? data.overview.delinquent_clients / data.overview.clients_total * 100 : 0;
  const serviceTrend = data?.service_trend.map((item) => ({ label: periodLabel(item.date, data.range.granularity), values: { scheduled: item.scheduled, completed: item.completed, cancelled: item.cancelled } })) ?? [];
  const revenueTrend = data?.revenue_trend.map((item) => ({ label: periodLabel(item.date, data.range.granularity), values: { collected: Number(item.collected) } })) ?? [];
  const statusData: BarDatum[] = data?.status_breakdown.map((item) => ({ label: item.label, value: item.count, color: statusColors[item.status] })) ?? [];
  const workloadData: BarDatum[] = data?.technician_workload.map((item) => ({ label: item.name, value: item.total, meta: `${item.open} abiertos · ${item.completed} finalizados`, color: "#245f89" })) ?? [];
  const paymentData: BarDatum[] = data?.payment_methods.map((item) => ({ label: item.name, value: Number(item.total), displayValue: currency(item.total), meta: `${item.count} movimientos`, color: "#167455" })) ?? [];
  const selectPreset = (next: Exclude<DashboardRangePreset, "custom">) => { setPreset(next); setRange(dashboardPresetRange(next)); };
  const rangeDetail = data ? `${displayDate(data.range.start)} al ${displayDate(data.range.end)}` : "";

  return <div className="page dashboard-page">
    <header className="page-header"><div><p className="eyebrow">PANEL GENERAL</p><h1>Resumen del negocio</h1><p>{new Intl.DateTimeFormat("es-AR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now)}</p></div><div className="live-indicator"><span /> Actualización en vivo</div></header>

    <section className="dashboard-range-filter" aria-label="Período de los gráficos">
      <div className="dashboard-range-presets"><button type="button" className={preset === "week" ? "active" : ""} onClick={() => selectPreset("week")}>Última semana</button><button type="button" className={preset === "month" ? "active" : ""} onClick={() => selectPreset("month")}>Último mes</button><button type="button" className={preset === "year" ? "active" : ""} onClick={() => selectPreset("year")}>Último año</button></div>
      <div className="dashboard-range-dates"><label>Desde<input type="date" value={range.start} onChange={(event) => { setPreset("custom"); setRange((current) => ({ ...current, start: event.target.value })); }} /></label><label>Hasta<input type="date" value={range.end} onChange={(event) => { setPreset("custom"); setRange((current) => ({ ...current, end: event.target.value })); }} /></label></div>
    </section>
    {!validRange && <div className="inline-alert danger">La fecha desde no puede ser posterior a la fecha hasta.</div>}

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
        <article className="insight-card insight-wide"><InsightHeader eyebrow="SERVICIOS" title={data.range.granularity === "month" ? "Servicios por mes" : "Servicios por día"} detail={rangeDetail} /><TrendChart ariaLabel="Servicios programados, finalizados y cancelados en el período seleccionado" data={serviceTrend} series={[
          { key: "scheduled", label: "Programados", color: "#245f89" },
          { key: "completed", label: "Finalizados", color: "#167455" },
          { key: "cancelled", label: "Cancelados", color: "#a44b43", dashed: true },
        ]} /></article>
        <article className="insight-card"><InsightHeader eyebrow="ESTADOS" title="Distribución de servicios" detail={rangeDetail} /><BarRanking ariaLabel="Cantidad de servicios por estado en el período seleccionado" data={statusData} /></article>

        {data.finance && <article className="insight-card insight-wide"><InsightHeader eyebrow="INGRESOS" title={data.range.granularity === "month" ? "Cobranza por mes" : "Cobranza por día"} detail={rangeDetail} /><TrendChart ariaLabel="Importe cobrado en el período seleccionado" data={revenueTrend} series={[{ key: "collected", label: "Cobrado", color: "#167455", format: currency }]} /></article>}
        {data.finance && <article className="insight-card"><InsightHeader eyebrow="COBRANZA" title="Medios de pago" detail={rangeDetail} /><BarRanking ariaLabel="Importe cobrado por medio de pago en el período seleccionado" data={paymentData} /></article>}

        <article className="insight-card insight-full"><InsightHeader eyebrow="EQUIPO" title="Carga por técnico" detail={rangeDetail} /><BarRanking ariaLabel="Cantidad de servicios por técnico en el período seleccionado" data={workloadData} /></article>
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

function periodLabel(value: string, granularity: "day" | "month") {
  return new Intl.DateTimeFormat("es-AR", granularity === "month" ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)).replace(".", "");
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
