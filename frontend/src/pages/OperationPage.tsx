import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleDashed, Clock3, PlayCircle, UserMinus, UserRoundCheck } from "lucide-react";
import { api } from "../lib/api";
import { timeOnly, TZ } from "../lib/format";
import type { DashboardData, ServiceStatus } from "../types";
import { EmptyState } from "../components/EmptyState";
import { ServicePanel } from "../components/ServicePanel";
import { StatusBadge } from "../components/StatusBadge";

const metrics: Array<{ key: ServiceStatus | "UNASSIGNED"; label: string; icon: typeof Clock3 }> = [
  { key: "PENDING", label: "Pendientes", icon: CircleDashed },
  { key: "UNASSIGNED", label: "Sin asignar", icon: UserMinus },
  { key: "ASSIGNED", label: "En camino", icon: UserRoundCheck },
  { key: "IN_PROGRESS", label: "En curso", icon: PlayCircle },
  { key: "COMPLETED", label: "Finalizados", icon: CheckCircle2 },
  { key: "CANCELLED", label: "Cancelados", icon: AlertTriangle }
];

export function OperationPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const operation = useQuery({ queryKey: ["dashboard"], queryFn: () => api<DashboardData>("/dashboard/today/"), refetchInterval: 60_000 });
  const now = new Date();
  const data = operation.data;
  const delayed = data?.services.filter((service) => service.scheduled_at && new Date(service.scheduled_at) < now && ["PENDING", "ASSIGNED"].includes(service.status)).length ?? 0;

  return <div className="page dashboard-page">
    <header className="page-header"><div><p className="eyebrow">OPERACIÓN EN VIVO</p><h1>Servicios de hoy</h1><p>{new Intl.DateTimeFormat("es-AR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now)}</p></div><div className="live-indicator"><span /> Actualización en vivo</div></header>

    {operation.isPending && <div className="dashboard-skeleton" aria-label="Cargando operación"><i /><i /><i /><i /><i /><i /></div>}
    {operation.isError && <div className="inline-alert danger">No se pudo cargar la operación. Verificá la conexión y tus permisos.</div>}

    {data && <>
      <section className="metric-rail">
        {metrics.map(({ key, label, icon: Icon }) => <div key={key}><Icon /><span>{label}</span><strong>{data.counts[key] ?? 0}</strong></div>)}
        <div className={delayed ? "metric-alert" : ""}><Clock3 /><span>Demorados</span><strong>{delayed}</strong></div>
      </section>
      <section className="operation-board">
        <header><div><p className="eyebrow">SECUENCIA DEL DÍA</p><h2>Despacho y ejecución</h2></div><span>{data.services.length} órdenes</span></header>
        <div className="service-table"><div className="service-row table-head"><span>Hora</span><span>Cliente / trabajo</span><span>Ubicación</span><span>Técnico</span><span>Estado</span><span /></div>
          {data.services.map((service) => <button key={service.id} className={`service-row ${service.requires_review ? "needs-review" : ""}`} onClick={() => setSelected(service.id)}>
            <span className="service-time">{timeOnly(service.scheduled_at)}</span><span><strong>{service.client_name}</strong><small>{service.description}</small></span><span><strong>{service.address_text || service.address_snapshot || "Sin dirección"}</strong><small>{service.arrival_at ? `Llegó ${timeOnly(service.arrival_at)}` : "Aún sin llegada"}</small></span><span>{service.technician_name || <em>Sin asignar</em>}</span><span><StatusBadge status={service.status} /></span><ArrowUpRight />
          </button>)}
        </div>
        {!data.services.length && <EmptyState icon={CheckCircle2} title="Jornada despejada" detail="No hay servicios programados para hoy." />}
      </section>
    </>}
    {selected && <ServicePanel serviceId={selected} onClose={() => setSelected(null)} />}
  </div>;
}
