import { useEffect, useMemo, useState, type ChangeEvent, type ClipboardEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, CheckCircle2, ChevronRight, ClipboardPaste, Clock3, CloudOff, History, Images, MapPin, MessageCircle, Navigation, Send, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { api, resultList } from "../lib/api";
import { cacheServices, enqueue, enqueuePhoto, offlineDb, syncOffline } from "../lib/offline";
import { dateTime, timeOnly } from "../lib/format";
import { groupTechnicianServices } from "../lib/technicianServices";
import type { Service } from "../types";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";

type TechTab = "pending" | "today" | "upcoming" | "history";

export function buildCompletionPayload(notes: string, amountDue: string, collectedAmount: string) {
  const payload: Record<string, unknown> = { notes: notes.trim() };
  const total = amountDue.trim();
  const collected = collectedAmount.trim();
  if (total) payload.amount_due = total;
  if (collected) payload.collected_amount = collected;
  return payload;
}

interface TechnicianCompletionFormProps {
  notes: string;
  amountDue: string;
  collectedAmount: string;
  disabled: boolean;
  onNotesChange: (value: string) => void;
  onAmountDueChange: (value: string) => void;
  onCollectedAmountChange: (value: string) => void;
  onFiles: (files: File[]) => void;
  onClipboardError: (message: string) => void;
  uploadingPhotos?: boolean;
  onSubmit: () => void;
}

interface ClipboardImageItem {
  types: readonly string[];
  getType: (type: string) => Promise<Blob>;
}

const imageExtension: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif" };

export async function clipboardItemsToImageFiles(items: readonly ClipboardImageItem[], timestamp = Date.now()) {
  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find((candidate) => candidate.startsWith("image/"));
    if (!type) continue;
    const blob = await item.getType(type);
    const detectedExtension = type.slice("image/".length).replace(/[^a-z0-9]/gi, "");
    const extension = imageExtension[type] ?? (detectedExtension || "png");
    files.push(new File([blob], `imagen-copiada-${timestamp}-${files.length + 1}.${extension}`, { type, lastModified: timestamp }));
  }
  return files;
}

function pastedImageFiles(event: ClipboardEvent<HTMLElement>) {
  const itemFiles = Array.from(event.clipboardData.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  return itemFiles.length ? itemFiles : Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
}

async function readClipboardImages() {
  if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") {
    throw new Error("Este dispositivo no permite leer imágenes con el botón. Enfocá el área y usá la opción Pegar del sistema.");
  }
  return clipboardItemsToImageFiles(await navigator.clipboard.read());
}

export function TechnicianCompletionForm({ notes, amountDue, collectedAmount, disabled, onNotesChange, onAmountDueChange, onCollectedAmountChange, onFiles, onClipboardError, uploadingPhotos = false, onSubmit }: TechnicianCompletionFormProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };
  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []).filter((file) => file.type.startsWith("image/"));
    event.currentTarget.value = "";
    if (files.length) onFiles(files);
  };
  const pasteFiles = (event: ClipboardEvent<HTMLFieldSetElement>) => {
    const files = pastedImageFiles(event);
    if (!files.length) { onClipboardError("El portapapeles no contiene una imagen."); return; }
    event.preventDefault();
    onFiles(files);
  };
  const readClipboard = async () => {
    try {
      const files = await readClipboardImages();
      if (!files.length) { onClipboardError("El portapapeles no contiene una imagen."); return; }
      onFiles(files);
    } catch (error) {
      onClipboardError(error instanceof Error ? error.message : "No se pudo leer la imagen copiada.");
    }
  };

  return <form className="work-log" onSubmit={submit}>
    <label>Observaciones del servicio<textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} rows={5} placeholder="Trabajo realizado, hallazgos y recomendaciones…" required /></label>
    <label className="completion-amount">Importe total<div className="completion-amount-input"><span aria-hidden="true">$</span><input name="amount_due" type="number" inputMode="decimal" min="0" step="0.01" value={amountDue} onChange={(event) => onAmountDueChange(event.target.value)} placeholder="0,00" /></div></label>
    <label className="completion-amount">Monto cobrado<div className="completion-amount-input"><span aria-hidden="true">$</span><input name="collected_amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={collectedAmount} onChange={(event) => onCollectedAmountChange(event.target.value)} placeholder="0,00" /></div></label>
    <fieldset className="photo-picker" disabled={disabled || uploadingPhotos} onPaste={pasteFiles} tabIndex={0} aria-busy={uploadingPhotos} aria-describedby="photo-picker-help">
      <legend>Evidencia fotográfica</legend>
      <p id="photo-picker-help">Tomá una foto, elegí una o varias imágenes guardadas, o pegá una imagen copiada.</p>
      <div className="photo-picker-actions">
        <label className="photo-source-button"><Camera /><span><strong>Tomar foto</strong><small>Abrir cámara</small></span><input type="file" accept="image/*" capture="environment" onChange={selectFiles} /></label>
        <label className="photo-source-button"><Images /><span><strong>Elegir imágenes</strong><small>Galería o archivos</small></span><input type="file" accept="image/*" multiple onChange={selectFiles} /></label>
        <button type="button" className="photo-source-button" onClick={() => void readClipboard()}><ClipboardPaste /><span><strong>Pegar imagen</strong><small>Desde el portapapeles</small></span></button>
      </div>
      <small className="photo-paste-hint">También podés enfocar este bloque y usar Ctrl+V o la opción Pegar del dispositivo.</small>
    </fieldset>
    <button className="button complete large" type="submit" disabled={disabled || uploadingPhotos}><CheckCircle2 /> {uploadingPhotos ? "Cargando imágenes…" : "Finalizar servicio"}</button>
  </form>;
}

export function TechnicianPage() {
  const queryClient = useQueryClient(); const [tab, setTab] = useState<TechTab>("pending"); const [selected, setSelected] = useState<Service | null>(null); const [notes, setNotes] = useState(""); const [amountDue, setAmountDue] = useState(""); const [collectedAmount, setCollectedAmount] = useState(""); const [offlineFallback, setOfflineFallback] = useState<Service[]>([]); const [message, setMessage] = useState(""); const [messageIsError, setMessageIsError] = useState(false); const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const services = useQuery({ queryKey: ["services", "technician"], queryFn: async () => {
    const items = resultList(await api<Service[] | { results: Service[] }>("/services/?assigned_to_me=true&page_size=200")); await cacheServices(items); return items;
  }, refetchInterval: 45_000 });
  useEffect(() => { if (services.isError) void offlineDb.services.toArray().then(setOfflineFallback); }, [services.isError]);
  useEffect(() => { const run = () => void syncOffline().then(() => queryClient.invalidateQueries({ queryKey: ["services"] })).catch(() => void 0); addEventListener("online", run); return () => removeEventListener("online", run); }, [queryClient]);
  const all = services.data ?? offlineFallback;
  const grouped = useMemo(() => groupTechnicianServices(all), [all]);
  const act = useMutation({
    mutationFn: ({ id, path, body }: { id: string; path: string; body?: Record<string, unknown> }) => api<Service>(`/services/${id}/${path}/`, { method: "POST", body: JSON.stringify(body ?? {}) }),
    onSuccess: (updated, variables) => { setSelected(updated); if (variables.path === "complete") { setAmountDue(""); setCollectedAmount(""); } setMessage(variables.path === "complete" && (variables.body?.amount_due || variables.body?.collected_amount) ? "Servicio finalizado e importes registrados." : "Acción registrada y sincronizada."); setMessageIsError(false); void queryClient.invalidateQueries({ queryKey: ["services"] }); },
    onError: (error) => { setMessage(error instanceof Error ? error.message : "No se pudo completar la operación."); setMessageIsError(true); }
  });
  const updateLocal = async (updated: Service) => {
    queryClient.setQueryData<Service[]>(["services", "technician"], (current) => current?.map((item) => item.id === updated.id ? updated : item));
    setOfflineFallback((current) => current.map((item) => item.id === updated.id ? updated : item));
    await offlineDb.services.put(updated);
    setSelected(updated);
  };
  const arrive = async (service: Service) => {
    setMessage(""); setMessageIsError(false); if (navigator.onLine) act.mutate({ id: service.id, path: "arrive" });
    else { await enqueue(service, "ARRIVE"); const updated = { ...service, status: "IN_PROGRESS" as const, arrival_at: new Date().toISOString() }; await updateLocal(updated); setMessage("Llegada guardada en este teléfono. Se enviará al recuperar conexión."); setMessageIsError(false); }
  };
  const complete = async (service: Service) => {
    if (!notes.trim()) { setMessage("La observación final es obligatoria."); setMessageIsError(true); return; }
    const body = buildCompletionPayload(notes, amountDue, collectedAmount);
    setMessage(""); setMessageIsError(false); if (navigator.onLine) act.mutate({ id: service.id, path: "complete", body });
    else { await enqueue(service, "COMPLETE", body); const updated = { ...service, status: "COMPLETED" as const, completion_notes: notes.trim(), completed_at: new Date().toISOString(), ...(amountDue.trim() ? { amount_due: amountDue.trim() } : {}) }; await updateLocal(updated); setAmountDue(""); setCollectedAmount(""); setMessage(amountDue.trim() || collectedAmount.trim() ? "Cierre e importes guardados. Se sincronizarán al recuperar conexión." : "Cierre guardado. Se sincronizará al recuperar conexión."); setMessageIsError(false); }
  };
  const uploadFiles = async (files: File[]) => {
    if (!selected || !files.length) return;
    const invalid = files.find((file) => !file.type.startsWith("image/"));
    if (invalid) { setMessage(`${invalid.name} no es una imagen válida.`); setMessageIsError(true); return; }
    const oversized = files.find((file) => file.size > 15 * 1024 * 1024);
    if (oversized) { setMessage(`${oversized.name} supera el máximo de 15 MB.`); setMessageIsError(true); return; }
    const serviceId = selected.id;
    let completed = 0;
    setUploadingPhotos(true); setMessage(""); setMessageIsError(false);
    try {
      for (const file of files) {
        if (!navigator.onLine) await enqueuePhoto(serviceId, file);
        else {
          const form = new FormData(); form.set("service", serviceId); form.set("client_operation_id", crypto.randomUUID()); form.set("image", file); form.set("captured_at", new Date().toISOString()); await api(`/services/${serviceId}/photos/`, { method: "POST", body: form });
        }
        completed += 1;
      }
      const uploadedMessage = completed === 1 ? "Imagen cargada." : `${completed} imágenes cargadas.`;
      const queuedMessage = completed === 1 ? "Imagen guardada para sincronizar." : `${completed} imágenes guardadas para sincronizar.`;
      setMessage(navigator.onLine ? uploadedMessage : queuedMessage); setMessageIsError(false);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "No se pudieron cargar las imágenes.";
      setMessage(completed ? `${completed} de ${files.length} imágenes cargadas. ${detail}` : detail); setMessageIsError(true);
    } finally {
      setUploadingPhotos(false);
    }
  };
  const list = grouped[tab];
  return <div className="page tech-page">
    <header className="page-header tech-header"><div><p className="eyebrow">MI RUTA</p><h1>Servicios asignados</h1><p>{navigator.onLine ? "Conectado con operaciones" : "Modo sin conexión activo"}</p></div>{!navigator.onLine && <span className="offline-pill"><CloudOff /> Offline</span>}</header>
    <div className="tech-tabs"><button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>Pendientes <b>{grouped.pending.length}</b></button><button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>Hoy <b>{grouped.today.length}</b></button><button className={tab === "upcoming" ? "active" : ""} onClick={() => setTab("upcoming")}>Próximos <b>{grouped.upcoming.length}</b></button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Historial</button></div>
    <div className="tech-workspace"><section className={`tech-service-list ${tab === "pending" ? "show-date" : ""}`}>{list.map((service) => <button key={service.id} className={selected?.id === service.id ? "active" : ""} onClick={() => { setSelected(service); setNotes(service.completion_notes ?? ""); setAmountDue(service.amount_due ?? ""); setCollectedAmount(""); setMessage(""); setMessageIsError(false); }}><span className="tech-time">{tab === "pending" ? dateTime(service.scheduled_at) : timeOnly(service.scheduled_at)}</span><span><StatusBadge status={service.status} /><strong>{service.client_name}</strong><small><MapPin /> {service.address_text || service.address_snapshot || "Sin dirección"}</small><p>{service.description}</p></span><ChevronRight /></button>)}{!list.length && <EmptyState icon={Wrench} title="Nada por aquí" detail={tab === "pending" ? "No tenés tareas pendientes." : tab === "today" ? "No tenés servicios para hoy." : "No hay servicios en esta sección."} />}</section>
      {selected ? <section className="tech-service-detail"><button className="tech-back" type="button" onClick={() => setSelected(null)}><ArrowLeft /> Volver a la lista</button><header><div><p className="eyebrow">ORDEN {selected.id.slice(0, 8).toUpperCase()}</p><h2>{selected.client_name}</h2></div><StatusBadge status={selected.status} /></header><div className="tech-location"><MapPin /><div><strong>{selected.address_text || selected.address_snapshot || "Sin dirección"}</strong><span>{selected.description}</span></div></div><div className="tech-facts"><span><Clock3 /> Programado <b>{dateTime(selected.scheduled_at)}</b></span><span><Navigation /> Llegada <b>{timeOnly(selected.arrival_at)}</b></span></div>
        <div className="tech-actions-top"><a className="button secondary" href={`https://wa.me/${selected.client_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${selected.client_name}, soy el técnico de Marcelo Balcar.`)}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a><Link className="button secondary" to={`/clientes/${selected.client}`}><History /> Historial</Link>{selected.status === "ASSIGNED" && <button className="button arrival" onClick={() => void arrive(selected)} disabled={act.isPending}><Navigation /> Llegué</button>}</div>
        {selected.status === "IN_PROGRESS" && <TechnicianCompletionForm notes={notes} amountDue={amountDue} collectedAmount={collectedAmount} disabled={act.isPending} uploadingPhotos={uploadingPhotos} onNotesChange={setNotes} onAmountDueChange={setAmountDue} onCollectedAmountChange={setCollectedAmount} onFiles={(files) => void uploadFiles(files)} onClipboardError={(detail) => { setMessage(detail); setMessageIsError(true); }} onSubmit={() => void complete(selected)} />}
        {message && <div className={`inline-alert ${messageIsError ? "danger" : "success"}`}><Send /> {message}</div>}
        {selected.completion_notes && <div className="note-box"><CheckCircle2 /><div><strong>Servicio finalizado</strong><p>{selected.completion_notes}</p><small>{dateTime(selected.completed_at)}</small></div></div>}
      </section> : <section className="tech-placeholder"><Wrench /><h2>Elegí un servicio</h2><p>Acá vas a registrar la llegada, el trabajo y las fotos.</p></section>}
    </div>
  </div>;
}
