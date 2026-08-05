import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Archive, ArchiveRestore, ArrowLeft, CalendarPlus, Edit3, History, MapPin, Phone, Plus } from "lucide-react";
import { api, ApiError, resultList } from "../lib/api";
import { clientFormPayload } from "../lib/clients";
import { argentinaWallTimeToIso, dateTime, dayOnly, inputDateTime, monthShort } from "../lib/format";
import type { Address, ApplicationSettings, Client, ClientAccount, Service, Technician } from "../types";
import { ClientAccountSection } from "../components/ClientAccountSection";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { ServicePanel } from "../components/ServicePanel";
import { StatusBadge } from "../components/StatusBadge";
import { WhatsAppLink } from "../components/WhatsAppLink";

export function ClientDetailPage({ technician = false, canViewBilling = false }: { technician?: boolean; canViewBilling?: boolean }) {
  const { id = "" } = useParams(); const navigate = useNavigate(); const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"client" | "address" | "edit-address" | "service" | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedServiceTab, setSelectedServiceTab] = useState<"detail" | "billing">("detail");
  const client = useQuery({ queryKey: ["client", id], queryFn: () => api<Client>(`/clients/${id}/`) });
  const account = useQuery({ queryKey: ["client-account", id], queryFn: () => api<ClientAccount>(`/clients/${id}/account/`), enabled: canViewBilling && !technician });
  const applicationSettings = useQuery({ queryKey: ["settings"], queryFn: () => api<ApplicationSettings>("/settings/") });
  const addresses = useQuery({ queryKey: ["addresses", id, showArchived], queryFn: async () => resultList(await api<Address[] | { results: Address[] }>(`/addresses/?client=${id}${showArchived ? "&archived=only" : ""}`)) });
  const services = useQuery({ queryKey: ["services", "client", id, showArchived], queryFn: async () => resultList(await api<Service[] | { results: Service[] }>(`/services/?client=${id}${showArchived ? "&archived=only" : ""}`)) });
  const techs = useQuery({ queryKey: ["technicians"], queryFn: async () => resultList(await api<Technician[] | { results: Technician[] }>("/technicians/")), enabled: !technician });
  const save = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: Record<string, unknown> }) => api(path, { method, body: body ? JSON.stringify(body) : undefined }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client", id] }),
        queryClient.invalidateQueries({ queryKey: ["addresses", id] }),
        queryClient.invalidateQueries({ queryKey: ["services"] })
      ]);
      setDialog(null);
    }
  });
  const submitClient = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); save.mutate({ path: `/clients/${id}/`, method: "PATCH", body: clientFormPayload(data) }); };
  const submitAddress = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); save.mutate({ path: "/addresses/", method: "POST", body: { ...Object.fromEntries(data.entries()), client: id } }); };
  const updateAddress = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selectedAddress) return; const data = new FormData(event.currentTarget); save.mutate({ path: `/addresses/${selectedAddress.id}/`, method: "PATCH", body: Object.fromEntries(data.entries()) }); };
  const archiveAddress = (address: Address) => { if (confirm("¿Archivar esta dirección? Se conservará en el historial.")) save.mutate({ path: `/addresses/${address.id}/`, method: "DELETE" }); };
  const restoreAddress = (address: Address) => save.mutate({ path: `/addresses/${address.id}/restore/`, method: "POST", body: {} });
  const restoreService = (service: Service) => save.mutate({ path: `/services/${service.id}/restore/`, method: "POST", body: {} });
  const submitService = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const assigned = data.get("assigned_technician");
    const request = { path: "/services/", method: "POST", body: { ...Object.fromEntries(data.entries()), client: id, assigned_technician: assigned || null, scheduled_at: data.get("scheduled_at") ? argentinaWallTimeToIso(String(data.get("scheduled_at"))) : null } };
    save.mutate(request, { onError: (error) => {
      if (error instanceof ApiError && typeof error.data === "object" && error.data && "overlap" in error.data && confirm("El técnico tiene otro servicio superpuesto. ¿Confirmar igualmente?")) {
        save.mutate({ ...request, body: { ...request.body, override_overlap: true } });
      }
    } });
  };
  const archiveClient = () => { if (confirm("¿Archivar este cliente? Sus datos se conservarán y podrán restaurarse.")) save.mutate({ path: `/clients/${id}/`, method: "DELETE" }, { onSuccess: () => navigate("/clientes") }); };
  if (client.isPending) return <div className="page panel-loading">Cargando ficha…</div>;
  if (!client.data) return <div className="page"><div className="inline-alert danger">No se encontró el cliente.</div></div>;
  return <div className="page">
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft /> Volver</button>
    <header className="client-profile-head"><div className="client-monogram">{client.data.name.charAt(0)}</div><div><p className="eyebrow">FICHA DEL CLIENTE</p><h1>{client.data.name}</h1><p className="client-profile-contact"><Phone /> <span>{client.data.phone}{client.data.email ? ` · ${client.data.email}` : ""}</span>{applicationSettings.data && <WhatsAppLink phone={client.data.phone} message={applicationSettings.data.base_message} clientName={client.data.name} compact />}{client.data.is_delinquent && <em className="delinquent-flag">En mora</em>}</p></div>{!technician && <div className="head-actions"><button className="button secondary" onClick={() => setDialog("client")} disabled={client.data.legacy_locked}><Edit3 /> Editar</button><button className="icon-button danger-text" onClick={archiveClient} aria-label="Archivar cliente" title="Archivar cliente"><Archive /></button></div>}</header>
    {client.data.legacy_locked && !technician && <div className="inline-alert warning">Registro histórico bloqueado durante el ensayo de migración. El corte final habilita su edición.</div>}
    {!technician && <div className="record-filter"><button className="button secondary" onClick={() => setShowArchived((value) => !value)}><ArchiveRestore /> {showArchived ? "Ver registros activos" : "Ver archivados"}</button></div>}
    {canViewBilling && !technician && <ClientAccountSection account={account.data} pending={account.isPending} onSelectService={(serviceId) => { setSelectedServiceTab("billing"); setSelectedService(serviceId); }} />}
    <div className="client-layout">
      <section className="flat-section"><header><div><p className="eyebrow">DOMICILIOS</p><h2>{showArchived ? "Direcciones archivadas" : "Direcciones"}</h2></div>{!technician && !showArchived && <button className="button text" onClick={() => setDialog("address")}><Plus /> Agregar</button>}</header><div className="address-list">{addresses.data?.map((address) => <article key={address.id}><MapPin /><div><strong>{address.full_text}</strong><p>{address.reference || "Sin referencia adicional"}</p></div>{!technician && <span className="row-actions">{showArchived ? <button className="icon-button" title="Restaurar" onClick={() => restoreAddress(address)}><ArchiveRestore /></button> : <><button className="icon-button" title="Editar" onClick={() => { setSelectedAddress(address); setDialog("edit-address"); }}><Edit3 /></button><button className="icon-button danger-text" title="Archivar" onClick={() => archiveAddress(address)}><Archive /></button></>}</span>}</article>)}</div>{!addresses.data?.length && <EmptyState icon={MapPin} title={showArchived ? "Sin direcciones archivadas" : "Sin direcciones"} detail={showArchived ? "No hay registros para restaurar." : "Agregá el primer domicilio de atención."} />}</section>
      <section className="flat-section services-history"><header><div><p className="eyebrow">TRAZABILIDAD</p><h2>{showArchived ? "Servicios archivados" : "Servicios"}</h2></div>{!technician && !showArchived && <button className="button primary" onClick={() => setDialog("service")}><CalendarPlus /> Programar</button>}</header><div className="compact-service-list">{services.data?.map((service) => <button key={service.id} onClick={() => { if (showArchived) restoreService(service); else { setSelectedServiceTab("detail"); setSelectedService(service.id); } }}><span className="date-block"><strong>{dayOnly(service.scheduled_at)}</strong><small>{monthShort(service.scheduled_at)}</small></span><span><strong>{service.description || "Servicio sin descripción"}</strong><small>{showArchived ? "Tocar para restaurar" : `${dateTime(service.scheduled_at)} · ${service.address_text || service.address_snapshot || "Sin dirección"}`}</small></span>{showArchived ? <ArchiveRestore /> : <StatusBadge status={service.status} />}</button>)}</div>{!services.data?.length && <EmptyState icon={History} title={showArchived ? "Sin servicios archivados" : "Sin historial"} detail={showArchived ? "No hay registros para restaurar." : "Todavía no hay servicios asociados."} />}</section>
    </div>
    {dialog === "client" && <Modal title="Editar cliente" onClose={() => setDialog(null)}><form className="form-stack" onSubmit={submitClient}><label>Nombre<input name="name" defaultValue={client.data.name} required /></label><label>Teléfono<input name="phone" defaultValue={client.data.phone} required /></label><div className="form-grid"><label>Email<input name="email" type="email" defaultValue={client.data.email} /></label><label>DNI<input name="dni" defaultValue={client.data.dni} /></label></div><label className="check-line delinquency-check"><input type="checkbox" name="is_delinquent" defaultChecked={client.data.is_delinquent} /> <span><strong>Cliente en mora</strong><small>Desactivalo cuando regularice la deuda.</small></span></label><label>Condición / observaciones<textarea name="condition" defaultValue={client.data.condition} /></label><FormFooter pending={save.isPending} close={() => setDialog(null)} error={save.error?.message} /></form></Modal>}
    {dialog === "address" && <Modal title="Nueva dirección" onClose={() => setDialog(null)}><form className="form-stack" onSubmit={submitAddress}><label>Dirección completa<input name="full_text" required autoFocus /></label><label>Referencia / notas<textarea name="reference" rows={3} /></label><FormFooter pending={save.isPending} close={() => setDialog(null)} error={save.error?.message} /></form></Modal>}
    {dialog === "edit-address" && selectedAddress && <Modal title="Editar dirección" onClose={() => setDialog(null)}><form className="form-stack" onSubmit={updateAddress}><label>Dirección completa<input name="full_text" required defaultValue={selectedAddress.full_text} /></label><label>Referencia / notas<textarea name="reference" rows={3} defaultValue={selectedAddress.reference} /></label><FormFooter pending={save.isPending} close={() => setDialog(null)} error={save.error?.message} /></form></Modal>}
    {dialog === "service" && <Modal title="Programar servicio" onClose={() => setDialog(null)}><form className="form-stack" onSubmit={submitService}><label>Trabajo a realizar<textarea name="description" rows={3} required /></label><label>Dirección<select name="address"><option value="">Sin dirección</option>{addresses.data?.map((address) => <option key={address.id} value={address.id}>{address.full_text}</option>)}</select></label><div className="form-grid"><label>Fecha y hora<input type="datetime-local" name="scheduled_at" defaultValue={inputDateTime(new Date().toISOString())} required /></label><label>Duración<input type="number" name="scheduled_duration_minutes" defaultValue="60" min="15" step="15" /></label></div><label>Técnico<select name="assigned_technician"><option value="">Sin asignar</option>{techs.data?.filter((tech) => tech.active).map((tech) => <option key={tech.id} value={tech.id}>{tech.display_name}</option>)}</select></label><label>Notas administrativas<textarea name="admin_notes" /></label><FormFooter pending={save.isPending} close={() => setDialog(null)} error={save.error?.message} /></form></Modal>}
    {selectedService && <ServicePanel serviceId={selectedService} initialTab={selectedServiceTab} onClose={() => setSelectedService(null)} allowFinance={canViewBilling && !technician} />}
  </div>;
}

function FormFooter({ pending, close, error }: { pending: boolean; close: () => void; error?: string }) { return <>{error && <p className="form-error">{error}</p>}<div className="form-actions"><button type="button" className="button ghost" onClick={close}>Cancelar</button><button className="button primary" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</button></div></>; }
