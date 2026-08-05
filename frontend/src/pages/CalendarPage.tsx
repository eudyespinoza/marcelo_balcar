import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
import { CalendarDays, SlidersHorizontal } from "lucide-react";
import { api, resultList } from "../lib/api";
import { argentinaDateKey, argentinaWallTimeToIso, inputDateTime } from "../lib/format";
import type { Service, ServiceStatus, Technician } from "../types";
import { ServicePanel } from "../components/ServicePanel";

const statusOptions: Array<{ value: "" | ServiceStatus; label: string }> = [{ value: "", label: "Todos los estados" }, { value: "PENDING", label: "Pendientes" }, { value: "ASSIGNED", label: "Asignados" }, { value: "IN_PROGRESS", label: "En curso" }, { value: "COMPLETED", label: "Finalizados" }, { value: "CANCELLED", label: "Cancelados" }];

export function CalendarPage({ canViewBilling = false, canManageBilling = false }: { canViewBilling?: boolean; canManageBilling?: boolean }) {
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [technician, setTechnician] = useState(""); const [status, setStatus] = useState<"" | ServiceStatus>(""); const [selected, setSelected] = useState<string | null>(null);
  const [mobileCalendar, setMobileCalendar] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches);
  const queryClient = useQueryClient();
  useEffect(() => {
    const query = window.matchMedia("(max-width: 820px)");
    const update = () => setMobileCalendar(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const techs = useQuery({ queryKey: ["technicians"], queryFn: async () => resultList(await api<Technician[] | { results: Technician[] }>("/technicians/")) });
  const calendar = useQuery({
    queryKey: ["calendar", range?.start, range?.end, technician],
    enabled: Boolean(range),
    queryFn: async () => {
      if (!range) return [];
      return resultList(await api<Service[] | { results: Service[] }>(`/calendar/events/?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}${technician ? `&technician=${technician}` : ""}`));
    }
  });
  const move = useMutation({
    mutationFn: ({ id, start, override = false }: { id: string; start: string; override?: boolean }) => api(`/services/${id}/`, { method: "PATCH", body: JSON.stringify({ scheduled_at: start, override_overlap: override }) }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["calendar"] }); },
  });
  const events = useMemo(() => (calendar.data ?? []).filter((service): service is Service & { scheduled_at: string } => Boolean(service.scheduled_at) && (!status || service.status === status)).map((service) => ({
    id: service.id, title: `${service.client_name} · ${service.description}`, start: inputDateTime(service.scheduled_at),
    end: service.scheduled_at ? inputDateTime(new Date(new Date(service.scheduled_at).getTime() + service.scheduled_duration_minutes * 60_000).toISOString()) : undefined,
    classNames: [`event-${service.status.toLowerCase()}`], extendedProps: { service }
  })), [calendar.data, status]);
  return <div className="page calendar-page">
    <header className="page-header"><div><p className="eyebrow">PLANIFICACIÓN</p><h1>Agenda de servicios</h1><p>Reprogramá arrastrando. Toda modificación queda en el historial.</p></div><div className="calendar-filters"><SlidersHorizontal /><select value={technician} onChange={(event) => setTechnician(event.target.value)}><option value="">Todos los técnicos</option>{techs.data?.map((item) => <option value={item.id} key={item.id}>{item.display_name}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{statusOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></div></header>
    <section className="calendar-surface">
      {calendar.isError && <div className="inline-alert danger">No se pudo cargar la agenda.</div>}
      <FullCalendar key={mobileCalendar ? "mobile" : "desktop"} plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]} locale={esLocale} initialView={mobileCalendar ? "listWeek" : "timeGridWeek"} initialDate={argentinaDateKey()} firstDay={1} allDaySlot={false} slotMinTime="07:00:00" slotMaxTime="24:00:00" slotDuration="00:30:00" height="auto" nowIndicator editable={!mobileCalendar} eventDurationEditable={false} events={events} headerToolbar={mobileCalendar ? { left: "prev,next", center: "title", right: "today" } : { left: "prev,next today", center: "title", right: "timeGridDay,timeGridWeek,dayGridMonth,listWeek" }} buttonText={{ today: "Hoy", day: "Día", week: "Semana", month: "Mes", list: "Lista" }} datesSet={(info) => setRange({ start: calendarDateToArgentinaIso(info.start), end: calendarDateToArgentinaIso(info.end) })} eventClick={(info) => setSelected(info.event.id)} eventDrop={(info) => {
        const start = info.event.start ? calendarDateToArgentinaIso(info.event.start) : null; if (!start) return;
        move.mutate({ id: info.event.id, start }, { onError: (error: unknown) => {
          const overlap = typeof error === "object" && error && "data" in error && JSON.stringify((error as { data: unknown }).data).includes("overlap");
          if (overlap && confirm("El técnico tiene otro servicio superpuesto. ¿Confirmar igualmente?")) move.mutate({ id: info.event.id, start, override: true }); else info.revert();
        } });
      }} eventContent={(arg) => <div className="calendar-event"><b>{arg.timeText}</b><span>{arg.event.title}</span></div>} />
      {!calendar.isPending && !events.length && <div className="calendar-empty"><CalendarDays /><span>No hay servicios en este período con los filtros elegidos.</span></div>}
    </section>
    {selected && <ServicePanel serviceId={selected} onClose={() => setSelected(null)} allowFinance={canViewBilling} allowPaymentManagement={canManageBilling} />}
  </div>;
}

function calendarDateToArgentinaIso(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const wallTime = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return argentinaWallTimeToIso(wallTime);
}
