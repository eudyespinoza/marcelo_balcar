import { useDeferredValue, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, ArrowRight, Building2, CircleDollarSign, Plus, Search, UserRoundSearch } from "lucide-react";
import { Link } from "react-router-dom";
import { api, resultList } from "../lib/api";
import { clientFormPayload, clientListPath, type DelinquencyFilter } from "../lib/clients";
import type { ApplicationSettings, Client } from "../types";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { WhatsAppLink } from "../components/WhatsAppLink";

export function ClientsPage({ canViewDelinquency = false }: { canViewDelinquency?: boolean }) {
  const [search, setSearch] = useState("");
  const [delinquency, setDelinquency] = useState<DelinquencyFilter>("");
  const [creating, setCreating] = useState(false);
  const [archived, setArchived] = useState(false);
  const deferred = useDeferredValue(search);
  const queryClient = useQueryClient();
  const clients = useQuery({
    queryKey: ["clients", deferred, archived, delinquency],
    queryFn: async () => resultList(await api<Client[] | { results: Client[] }>(clientListPath(deferred, archived, delinquency)))
  });
  const applicationSettings = useQuery({ queryKey: ["settings"], queryFn: () => api<ApplicationSettings>("/settings/") });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Client>("/clients/", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { setCreating(false); void queryClient.invalidateQueries({ queryKey: ["clients"] }); }
  });
  const restore = useMutation({ mutationFn: (id: string) => api(`/clients/${id}/restore/`, { method: "POST", body: "{}" }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["clients"] }) });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate(clientFormPayload(new FormData(event.currentTarget)));
  };
  const hasFilters = Boolean(deferred.trim() || delinquency);
  const scopeLabel = delinquency === "true" ? "Mostrando clientes en mora" : delinquency === "false" ? "Mostrando clientes al día" : "La búsqueda también revisa sus direcciones";

  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">BASE OPERATIVA</p><h1>{archived ? "Clientes archivados" : "Clientes"}</h1><p>Encontrá por nombre, teléfono, DNI o dirección.</p></div><div className="head-actions"><button className="button secondary" onClick={() => setArchived((value) => !value)}><ArchiveRestore /> {archived ? "Ver activos" : "Archivados"}</button>{!archived && <button className="button primary" onClick={() => setCreating(true)}><Plus /> Nuevo cliente</button>}</div></header>
    <section className={`client-filter-bar ${canViewDelinquency ? "" : "search-only"}`}>
      <div className="client-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ej. González, 11 4567 8900 o Av. Rivadavia…" autoFocus /><kbd>⌘ K</kbd></div>
      {canViewDelinquency && <label className="delinquency-filter"><span><CircleDollarSign /> Condición</span><select aria-label="Filtrar por condición de mora" value={delinquency} onChange={(event) => setDelinquency(event.target.value as DelinquencyFilter)}><option value="">Todos</option><option value="true">En mora</option><option value="false">Al día</option></select></label>}
    </section>
    <section className="client-directory"><header><span>{clients.data?.length ?? 0} {(clients.data?.length ?? 0) === 1 ? "cliente encontrado" : "clientes encontrados"}</span><small>{scopeLabel}</small></header>
      <div className="directory-list">{clients.data?.map((client) => archived ? <div key={client.id} className="client-row archived-row"><span className="client-avatar">{client.name.charAt(0).toUpperCase()}</span><span><strong>{client.name}</strong><small>{client.phone}</small></span><span><Building2 /> {client.addresses_count} {client.addresses_count === 1 ? "dirección" : "direcciones"}</span><span>{client.services_count} {client.services_count === 1 ? "servicio" : "servicios"}</span><button className="button secondary" onClick={() => restore.mutate(client.id)}><ArchiveRestore /> Restaurar</button></div> : <div key={client.id} className="client-row active-client-row">
        <span className="client-avatar">{client.name.charAt(0).toUpperCase()}</span>
        <span className="client-identity"><strong>{client.name}</strong><span className="client-contact-line"><small>{client.phone}{client.email ? ` · ${client.email}` : ""}</small>{applicationSettings.data && <WhatsAppLink phone={client.phone} message={applicationSettings.data.base_message} clientName={client.name} compact />}</span></span>
        <span><Building2 /> {client.addresses_count} {client.addresses_count === 1 ? "dirección" : "direcciones"}</span>
        <span>{client.services_count} {client.services_count === 1 ? "servicio" : "servicios"}</span>
        <span className="client-flags">{client.is_delinquent && <em className="delinquent-flag">En mora</em>}{client.legacy_duplicate_allowed && <em className="legacy-flag">Revisar duplicado</em>}</span>
        <ArrowRight aria-hidden="true" />
        <Link className="client-row-link" to={`/clientes/${client.id}`} aria-label={`Ver ficha de ${client.name}`} />
      </div>)}</div>
      {!clients.isPending && !clients.data?.length && <EmptyState icon={UserRoundSearch} title={hasFilters ? "No encontramos coincidencias" : archived ? "No hay clientes archivados" : "Todavía no hay clientes"} detail={hasFilters ? "Ajustá la búsqueda o la condición de mora para ver otros clientes." : archived ? "Los clientes archivados aparecerán en esta lista." : "Creá el primer cliente para comenzar a programar servicios."} />}
    </section>
    {creating && <Modal title="Nuevo cliente" onClose={() => setCreating(false)}><form className="form-stack" onSubmit={submit}><label>Nombre y apellido<input name="name" required /></label><label>Teléfono<input name="phone" required inputMode="tel" /></label><div className="form-grid"><label>Email<input name="email" type="email" /></label><label>DNI<input name="dni" inputMode="numeric" /></label></div>{canViewDelinquency && <label className="check-line delinquency-check"><input type="checkbox" name="is_delinquent" /> <span><strong>Cliente en mora</strong><small>Activalo cuando tenga deuda pendiente.</small></span></label>}<label>Condición / observaciones<textarea name="condition" rows={3} /></label>{create.error && <p className="form-error">{create.error.message}</p>}<div className="form-actions"><button type="button" className="button ghost" onClick={() => setCreating(false)}>Cancelar</button><button className="button primary" disabled={create.isPending}>Crear cliente</button></div></form></Modal>}
  </div>;
}
