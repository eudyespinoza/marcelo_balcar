import { AlertTriangle, Check, CircleDot, Clock3, X } from "lucide-react";
import type { ServiceStatus } from "../types";

const content: Record<ServiceStatus, { label: string; icon: typeof Clock3 }> = {
  PENDING: { label: "Pendiente", icon: Clock3 },
  ASSIGNED: { label: "Asignado", icon: CircleDot },
  IN_PROGRESS: { label: "En curso", icon: AlertTriangle },
  COMPLETED: { label: "Finalizado", icon: Check },
  CANCELLED: { label: "Cancelado", icon: X }
};

export function StatusBadge({ status }: { status: ServiceStatus }) {
  const item = content[status] ?? content.PENDING;
  const Icon = item.icon;
  return <span className={`status status-${status.toLowerCase()}`}><Icon size={13} />{item.label}</span>;
}
