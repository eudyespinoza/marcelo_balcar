import { argentinaDateKey } from "./format";
import type { Service } from "../types";

const terminalStatuses = new Set<Service["status"]>(["COMPLETED", "CANCELLED"]);

function scheduledDate(service: Service) {
  return service.scheduled_at ? argentinaDateKey(new Date(service.scheduled_at)) : "";
}

function byScheduledAt(left: Service, right: Service) {
  return String(left.scheduled_at ?? "").localeCompare(String(right.scheduled_at ?? ""));
}

export function groupTechnicianServices(services: Service[], today = argentinaDateKey()) {
  const isOpen = (service: Service) => !terminalStatuses.has(service.status);

  return {
    pending: services
      .filter((service) => isOpen(service) && (!service.scheduled_at || scheduledDate(service) < today))
      .sort(byScheduledAt),
    today: services
      .filter((service) => isOpen(service) && scheduledDate(service) === today)
      .sort(byScheduledAt),
    upcoming: services
      .filter((service) => isOpen(service) && scheduledDate(service) > today)
      .sort(byScheduledAt),
    history: services.filter((service) => terminalStatuses.has(service.status))
  };
}
