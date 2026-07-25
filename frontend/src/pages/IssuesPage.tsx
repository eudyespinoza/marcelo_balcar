import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, Check, DatabaseZap, GitMerge } from "lucide-react";
import { api, resultList } from "../lib/api";
import { dateTime } from "../lib/format";
import type { DataIssue, SyncConflict } from "../types";

export function IssuesPage() {
  const [tab, setTab] = useState<"conflicts" | "data">("conflicts"); const queryClient = useQueryClient();
  const conflicts = useQuery({ queryKey: ["conflicts"], queryFn: async () => resultList(await api<SyncConflict[] | { results: SyncConflict[] }>("/sync-conflicts/")) });
  const issues = useQuery({ queryKey: ["issues"], queryFn: async () => resultList(await api<DataIssue[] | { results: DataIssue[] }>("/data-issues/")) });
  const resolve = useMutation({ mutationFn: ({ path, body }: { path: string; body?: Record<string, unknown> }) => api(path, { method: "POST", body: JSON.stringify(body ?? {}) }), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["conflicts"] }); void queryClient.invalidateQueries({ queryKey: ["issues"] }); } });
  const resolveConflict = (item: SyncConflict) => { const resolution = prompt("Describí cómo se resolvió el conflicto:"); if (resolution?.trim()) resolve.mutate({ path: `/sync-conflicts/${item.id}/resolve/`, body: { resolution } }); };
  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">CONTROL Y CONCILIACIÓN</p><h1>Incidencias</h1><p>Evidencia offline y anomalías heredadas, sin pérdida silenciosa de datos.</p></div></header>
    <div className="section-tabs"><button className={tab === "conflicts" ? "active" : ""} onClick={() => setTab("conflicts")}><GitMerge /> Conflictos offline <b>{conflicts.data?.length ?? 0}</b></button><button className={tab === "data" ? "active" : ""} onClick={() => setTab("data")}><DatabaseZap /> Datos heredados <b>{issues.data?.length ?? 0}</b></button></div>
    <section className="issues-list">{tab === "conflicts" ? conflicts.data?.map((item) => <article key={item.id}><span className="issue-icon"><GitMerge /></span><div><strong>{item.service_description || "Servicio"}</strong><p>{item.reason}</p><small>{dateTime(item.created_at)} · Orden {item.service.slice(0, 8)}</small></div><button className="button secondary" onClick={() => resolveConflict(item)}><Check /> Resolver</button></article>) : issues.data?.map((item) => <article key={item.id}><span className="issue-icon"><AlertOctagon /></span><div><strong>{item.issue_type.replaceAll("_", " ")}</strong><p>{item.description}</p><small>{item.source} · fila {item.row_reference} · {dateTime(item.created_at)}</small></div><button className="button secondary" onClick={() => resolve.mutate({ path: `/data-issues/${item.id}/resolve/` })}><Check /> Marcar revisada</button></article>)}{((tab === "conflicts" && !conflicts.data?.length) || (tab === "data" && !issues.data?.length)) && <div className="empty-state"><Check /><h3>Todo conciliado</h3><p>No quedan incidencias abiertas en esta sección.</p></div>}</section>
  </div>;
}
