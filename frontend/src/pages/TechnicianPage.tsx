import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, CheckCircle2, ChevronRight, Clock3, CloudOff, History, MapPin, MessageCircle, Navigation, Send, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { api, resultList } from "../lib/api";
import { cacheServices, enqueue, enqueuePhoto, offlineDb, syncOffline } from "../lib/offline";
import { dateTime, timeOnly } from "../lib/format";
import { groupTechnicianServices } from "../lib/technicianServices";
import type { Service } from "../types";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";

type TechTab = "pending" | "today" | "upcoming" | "history";

export function TechnicianPage() {
  const queryClient = useQueryClient(); const [tab, setTab] = useState<TechTab>("pending"); const [selected, setSelected] = useState<Service | null>(null); const [notes, setNotes] = useState(""); const [offlineFallback, setOfflineFallback] = useState<Service[]>([]); const [message, setMessage] = useState("");
  const services = useQuery({ queryKey: ["services", "technician"], queryFn: async () => {
    const items = resultList(await api<Service[] | { results: Service[] }>("/services/?assigned_to_me=true&page_size=200")); await cacheServices(items); return items;
  }, refetchInterval: 45_000 });
  useEffect(() => { if (services.isError) void offlineDb.services.toArray().then(setOfflineFallback); }, [services.isError]);
  useEffect(() => { const run = () => void syncOffline().then(() => queryClient.invalidateQueries({ queryKey: ["services"] })).catch(() => void 0); addEventListener("online", run); return () => removeEventListener("online", run); }, [queryClient]);
  const all = services.data ?? offlineFallback;
  const grouped = useMemo(() => groupTechnicianServices(all), [all]);
  const act = useMutation({
    mutationFn: ({ id, path, body }: { id: string; path: string; body?: Record<string, unknown> }) => api<Service>(`/services/${id}/${path}/`, { method: "POST", body: JSON.stringify(body ?? {}) }),
    onSuccess: (updated) => { setSelected(updated); setMessage("Acción registrada y sincronizada."); void queryClient.invalidateQueries({ queryKey: ["services"] }); }
  });
  const updateLocal = async (updated: Service) => {
    queryClient.setQueryData<Service[]>(["services", "technician"], (current) => current?.map((item) => item.id === updated.id ? updated : item));
    setOfflineFallback((current) => current.map((item) => item.id === updated.id ? updated : item));
    await offlineDb.services.put(updated);
    setSelected(updated);
  };
  const arrive = async (service: Service) => {
    setMessage(""); if (navigator.onLine) act.mutate({ id: service.id, path: "arrive" });
    else { await enqueue(service, "ARRIVE"); const updated = { ...service, status: "IN_PROGRESS" as const, arrival_at: new Date().toISOString() }; await updateLocal(updated); setMessage("Llegada guardada en este teléfono. Se enviará al recuperar conexión."); }
  };
  const complete = async (service: Service) => {
    if (!notes.trim()) { setMessage("La observación final es obligatoria."); return; }
    setMessage(""); if (navigator.onLine) act.mutate({ id: service.id, path: "complete", body: { notes } });
    else { await enqueue(service, "COMPLETE", { notes }); const updated = { ...service, status: "COMPLETED" as const, completion_notes: notes, completed_at: new Date().toISOString() }; await updateLocal(updated); setMessage("Cierre guardado. Se sincronizará al recuperar conexión."); }
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !selected) return;
    if (!navigator.onLine) { await enqueuePhoto(selected.id, file); setMessage("Foto guardada para sincronizar."); return; }
    const form = new FormData(); form.set("service", selected.id); form.set("client_operation_id", crypto.randomUUID()); form.set("image", file); form.set("captured_at", new Date().toISOString()); await api(`/services/${selected.id}/photos/`, { method: "POST", body: form }); setMessage("Foto cargada.");
  };
  const list = grouped[tab];
  return <div className="page tech-page">
    <header className="page-header tech-header"><div><p className="eyebrow">MI RUTA</p><h1>Servicios asignados</h1><p>{navigator.onLine ? "Conectado con operaciones" : "Modo sin conexión activo"}</p></div>{!navigator.onLine && <span className="offline-pill"><CloudOff /> Offline</span>}</header>
    <div className="tech-tabs"><button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>Pendientes <b>{grouped.pending.length}</b></button><button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>Hoy <b>{grouped.today.length}</b></button><button className={tab === "upcoming" ? "active" : ""} onClick={() => setTab("upcoming")}>Próximos <b>{grouped.upcoming.length}</b></button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Historial</button></div>
    <div className="tech-workspace"><section className={`tech-service-list ${tab === "pending" ? "show-date" : ""}`}>{list.map((service) => <button key={service.id} className={selected?.id === service.id ? "active" : ""} onClick={() => { setSelected(service); setNotes(service.completion_notes ?? ""); setMessage(""); }}><span className="tech-time">{tab === "pending" ? dateTime(service.scheduled_at) : timeOnly(service.scheduled_at)}</span><span><StatusBadge status={service.status} /><strong>{service.client_name}</strong><small><MapPin /> {service.address_text || service.address_snapshot || "Sin dirección"}</small><p>{service.description}</p></span><ChevronRight /></button>)}{!list.length && <EmptyState icon={Wrench} title="Nada por aquí" detail={tab === "pending" ? "No tenés tareas pendientes." : tab === "today" ? "No tenés servicios para hoy." : "No hay servicios en esta sección."} />}</section>
      {selected ? <section className="tech-service-detail"><button className="tech-back" type="button" onClick={() => setSelected(null)}><ArrowLeft /> Volver a la lista</button><header><div><p className="eyebrow">ORDEN {selected.id.slice(0, 8).toUpperCase()}</p><h2>{selected.client_name}</h2></div><StatusBadge status={selected.status} /></header><div className="tech-location"><MapPin /><div><strong>{selected.address_text || selected.address_snapshot || "Sin dirección"}</strong><span>{selected.description}</span></div></div><div className="tech-facts"><span><Clock3 /> Programado <b>{dateTime(selected.scheduled_at)}</b></span><span><Navigation /> Llegada <b>{timeOnly(selected.arrival_at)}</b></span></div>
        <div className="tech-actions-top"><a className="button secondary" href={`https://wa.me/${selected.client_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${selected.client_name}, soy el técnico de Marcelo Balcar.`)}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a><Link className="button secondary" to={`/clientes/${selected.client}`}><History /> Historial</Link>{selected.status === "ASSIGNED" && <button className="button arrival" onClick={() => void arrive(selected)} disabled={act.isPending}><Navigation /> Llegué</button>}</div>
        {selected.status === "IN_PROGRESS" && <div className="work-log"><label>Observaciones del servicio<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} placeholder="Trabajo realizado, hallazgos y recomendaciones…" /></label><label className="photo-button"><Camera /> Adjuntar foto<input type="file" accept="image/*" capture="environment" onChange={(event) => void upload(event)} /></label><button className="button complete large" onClick={() => void complete(selected)} disabled={act.isPending}><CheckCircle2 /> Finalizar servicio</button></div>}
        {message && <div className={`inline-alert ${message.includes("obligatoria") ? "danger" : "success"}`}><Send /> {message}</div>}
        {selected.completion_notes && <div className="note-box"><CheckCircle2 /><div><strong>Servicio finalizado</strong><p>{selected.completion_notes}</p><small>{dateTime(selected.completed_at)}</small></div></div>}
      </section> : <section className="tech-placeholder"><Wrench /><h2>Elegí un servicio</h2><p>Acá vas a registrar la llegada, el trabajo y las fotos.</p></section>}
    </div>
  </div>;
}
