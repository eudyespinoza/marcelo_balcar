import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Banknote, CalendarClock, CheckCircle2, CircleUserRound, Edit3, History, Image as ImageIcon, MapPin, MessageSquareText, RotateCcw, UserRoundCheck, XCircle } from "lucide-react";
import { api, ApiError, resultList } from "../lib/api";
import { argentinaWallTimeToIso, currency, dateTime, inputDateTime } from "../lib/format";
import type { Address, Payment, Service, ServicePhoto, Technician } from "../types";
import { Modal } from "./Modal";
import { StatusBadge } from "./StatusBadge";

export function ServicePanel({ serviceId, onClose, allowFinance = true }: { serviceId: string; onClose: () => void; allowFinance?: boolean }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"detail" | "history" | "billing">("detail");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const serviceQuery = useQuery({ queryKey: ["service", serviceId], queryFn: () => api<Service>(`/services/${serviceId}/`) });
  const technicians = useQuery({ queryKey: ["technicians"], queryFn: async () => resultList(await api<Technician[] | { results: Technician[] }>("/technicians/?active=true")) });
  const addresses = useQuery({ queryKey: ["addresses", serviceQuery.data?.client], queryFn: async () => resultList(await api<Address[] | { results: Address[] }>(`/addresses/?client=${serviceQuery.data?.client}`)), enabled: Boolean(serviceQuery.data?.client) });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["service", serviceId] }), queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["services"] }), queryClient.invalidateQueries({ queryKey: ["calendar"] })
    ]);
  };
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body: Record<string, unknown> }) => api(`/services/${serviceId}/${path}/`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: refresh, onError: (err) => setError(err instanceof Error ? err.message : "No se pudo completar la acción.")
  });
  const payment = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Payment>("/payments/", { method: "POST", body: JSON.stringify({ ...body, service: serviceId }) }),
    onSuccess: async () => { await refresh(); setError(""); }, onError: (err) => setError(err instanceof Error ? err.message : "No se pudo registrar el pago.")
  });
  const voidPayment = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api<Payment>(`/payments/${id}/void/`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: refresh, onError: (err) => setError(err instanceof Error ? err.message : "No se pudo anular el pago.")
  });
  const edit = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Service>(`/services/${serviceId}/`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: async () => { setEditing(false); await refresh(); }, onError: (err) => setError(err instanceof Error ? err.message : "No se pudo editar el servicio.")
  });
  const archive = useMutation({ mutationFn: () => api(`/services/${serviceId}/`, { method: "DELETE" }), onSuccess: async () => { await refresh(); onClose(); }, onError: (err) => setError(err instanceof Error ? err.message : "No se pudo archivar el servicio.") });

  const service = serviceQuery.data;
  const submitAssign = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    action.mutate({ path: "assign", body: { technician_id: data.get("technician_id") || null, reason: data.get("reason") } });
  };
  const submitReason = (path: "cancel" | "reopen", event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); action.mutate({ path, body: { reason: data.get("reason") } });
  };
  const submitPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    payment.mutate({ amount: data.get("amount"), method: data.get("method"), note: data.get("note"), paid_at: new Date().toISOString() });
  };
  const submitEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const amount = String(data.get("amount_due") ?? "");
    const body: Record<string, unknown> = { description: data.get("description"), address: data.get("address") || null, scheduled_at: data.get("scheduled_at") ? argentinaWallTimeToIso(String(data.get("scheduled_at"))) : null, scheduled_duration_minutes: Number(data.get("scheduled_duration_minutes")), admin_notes: data.get("admin_notes"), ...(allowFinance ? { amount_due: amount ? amount : null } : {}) };
    edit.mutate(body, { onError: (exception) => {
      if (exception instanceof ApiError && typeof exception.data === "object" && exception.data && "overlap" in exception.data && confirm("El técnico tiene otro servicio superpuesto. ¿Confirmar igualmente?")) edit.mutate({ ...body, override_overlap: true });
    } });
  };

  return <Modal title="Detalle del servicio" onClose={onClose} wide>
    {serviceQuery.isPending && <div className="panel-loading">Cargando servicio…</div>}
    {service && <>
      <div className="service-panel-head"><div><p className="eyebrow">ORDEN {service.id.slice(0, 8).toUpperCase()}</p><h3>{service.description || "Servicio sin descripción"}</h3></div><StatusBadge status={service.status} /></div>
      <div className="tabs"><button className={tab === "detail" ? "active" : ""} onClick={() => setTab("detail")}>Detalle</button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Historial</button>{allowFinance && service.balance !== undefined && <button className={tab === "billing" ? "active" : ""} onClick={() => setTab("billing")}>Cobranza</button>}</div>
      {error && <div className="inline-alert danger">{error}</div>}
      {tab === "detail" && editing && <form className="service-editor" onSubmit={submitEdit}><label className="span-2">Trabajo a realizar<textarea name="description" rows={3} defaultValue={service.description} required /></label><label className="span-2">Dirección<select name="address" defaultValue={service.address ?? ""}><option value="">Sin dirección</option>{addresses.data?.map((address) => <option key={address.id} value={address.id}>{address.full_text}</option>)}</select></label><label>Fecha y hora<input type="datetime-local" name="scheduled_at" defaultValue={inputDateTime(service.scheduled_at)} /></label><label>Duración prevista<input type="number" name="scheduled_duration_minutes" min="15" step="15" defaultValue={service.scheduled_duration_minutes} /></label><label className="span-2">Notas administrativas<textarea name="admin_notes" rows={3} defaultValue={service.admin_notes} /></label>{allowFinance && <label className="span-2">Importe total ARS<input name="amount_due" type="number" min="0" step="0.01" defaultValue={service.amount_due ?? ""} /></label>}<div className="form-actions span-2"><button type="button" className="button ghost" onClick={() => setEditing(false)}>Cancelar</button><button className="button primary" disabled={edit.isPending}>Guardar cambios</button></div></form>}
      {tab === "detail" && !editing && <div className="panel-grid">
        <section className="info-section"><h4>Ubicación y horario</h4><dl className="details-list"><div><dt><CircleUserRound /> Cliente</dt><dd>{service.client_name}<small>{service.client_phone}</small></dd></div><div><dt><MapPin /> Dirección</dt><dd>{service.address_text || service.address_snapshot || "Sin dirección"}</dd></div><div><dt><CalendarClock /> Programación</dt><dd>{dateTime(service.scheduled_at)}<small>{service.scheduled_duration_minutes} minutos previstos</small></dd></div><div><dt><UserRoundCheck /> Técnico</dt><dd>{service.technician_name || "Sin asignar"}</dd></div></dl>
          {service.completion_notes && <div className="note-box"><MessageSquareText /><div><strong>Observación final</strong><p>{service.completion_notes}</p></div></div>}
          <ServicePhotoGallery photos={service.photos ?? []} />
        </section>
        <aside className="action-section"><h4>Gestión</h4><button className="button secondary" onClick={() => setEditing(true)} disabled={service.legacy_locked}><Edit3 /> Editar datos</button>
          {!["COMPLETED", "CANCELLED"].includes(service.status) && <form onSubmit={submitAssign}><label>Técnico asignado<select name="technician_id" defaultValue={service.assigned_technician ?? ""}><option value="">Sin asignar</option>{technicians.data?.map((tech) => <option value={tech.id} key={tech.id}>{tech.display_name}</option>)}</select></label><label>Motivo si es reasignación<input name="reason" placeholder="Opcional fuera de servicio en curso" /></label><button className="button secondary" disabled={action.isPending}>Guardar asignación</button></form>}
          {!["COMPLETED", "CANCELLED"].includes(service.status) && <form onSubmit={(event) => submitReason("cancel", event)}><label>Motivo de cancelación<input name="reason" required /></label><button className="button danger" disabled={action.isPending}><XCircle /> Cancelar servicio</button></form>}
          {["COMPLETED", "CANCELLED"].includes(service.status) && <form onSubmit={(event) => submitReason("reopen", event)}><label>Motivo de reapertura<input name="reason" required /></label><button className="button secondary" disabled={action.isPending}><RotateCcw /> Reabrir</button></form>}
          <button className="button danger" onClick={() => { if (confirm("¿Archivar este servicio? Podrá restaurarse desde la ficha del cliente.")) archive.mutate(); }} disabled={archive.isPending || service.legacy_locked}><Archive /> Archivar</button>
        </aside>
      </div>}
      {tab === "history" && <section className="timeline"><h4>Historia inmutable</h4>{service.events?.map((event) => <article key={event.id}><span className="timeline-dot" /><div><strong>{event.kind_label}</strong><p>{event.reason || "Sin comentario adicional"}</p><small>{dateTime(event.occurred_at)} · {event.actor_name}</small></div></article>)}</section>}
      {tab === "billing" && <div className="billing-panel"><section><p className="eyebrow">SALDO DEL SERVICIO</p><strong className="money-total">{currency(service.balance)}</strong><div className="money-breakdown"><span>Total <b>{currency(service.amount_due)}</b></span><span>Cobrado <b>{currency(service.paid_amount)}</b></span></div></section><section><h4>Registrar pago</h4><PaymentForm onSubmit={submitPayment} disabled={payment.isPending} /></section><section className="payment-list"><h4>Movimientos</h4>{service.payments?.map((item) => <div key={item.id} className={item.voided_at ? "voided" : ""}><Banknote /><span><strong>{item.method_name}</strong><small>{dateTime(item.paid_at)} · {item.recorded_by_name}</small></span><b>{currency(item.amount)}</b>{!item.voided_at && <button className="icon-button" title="Anular pago" onClick={() => { const reason = prompt("Motivo de la anulación:"); if (reason?.trim()) voidPayment.mutate({ id: item.id, reason }); }}><RotateCcw /></button>}</div>)}</section></div>}
    </>}
  </Modal>;
}

export function ServicePhotoGallery({ photos }: { photos: ServicePhoto[] }) {
  if (!photos.length) return null;

  return <section className="service-photos" aria-label="Evidencia fotográfica">
    <header><div><ImageIcon /><h4>Evidencia fotográfica</h4></div><span>{photos.length} {photos.length === 1 ? "imagen" : "imágenes"}</span></header>
    <div className="service-photo-grid">{photos.map((photo, index) => <a className="service-photo-card" href={photo.image_url} target="_blank" rel="noreferrer" aria-label={`Abrir foto ${index + 1}`} key={photo.id}>
      <img src={photo.image_url} alt={photo.caption || `Evidencia ${index + 1} del servicio`} loading="lazy" />
      <span><strong>{photo.caption || `Evidencia ${index + 1}`}</strong><small>{photo.captured_at ? dateTime(photo.captured_at) : "Sin fecha registrada"}</small></span>
    </a>)}</div>
  </section>;
}

function PaymentForm({ onSubmit, disabled }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; disabled: boolean }) {
  const methods = useQuery({ queryKey: ["payment-methods"], queryFn: async () => resultList(await api<Array<{ id: string; name: string }> | { results: Array<{ id: string; name: string }> }>("/payment-methods/")) });
  return <form className="payment-form" onSubmit={onSubmit}><label>Importe<input type="number" name="amount" min="0.01" step="0.01" required /></label><label>Medio<select name="method" required><option value="">Seleccionar</option>{methods.data?.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label><label className="span-2">Nota<input name="note" /></label><button className="button primary span-2" disabled={disabled}><CheckCircle2 /> Registrar cobro</button></form>;
}
