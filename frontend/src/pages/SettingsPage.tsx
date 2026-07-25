import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { api } from "../lib/api";
import type { ApplicationSettings } from "../types";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<ApplicationSettings>("/settings/") });
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const update = useMutation({
    mutationFn: (baseMessage: string) => api<ApplicationSettings>("/settings/", { method: "PATCH", body: JSON.stringify({ base_message: baseMessage }) }),
    onSuccess: (data) => {
      queryClient.setQueryData(["settings"], data);
      setMessage(data.base_message);
      setSaved(true);
    }
  });

  useEffect(() => {
    if (settings.data) setMessage(settings.data.base_message);
  }, [settings.data]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(false);
    if (message.trim()) update.mutate(message.trim());
  };

  return <div className="page settings-page">
    <header className="page-header"><div><p className="eyebrow">PREFERENCIAS</p><h1>Configuración</h1><p>Definí el texto que se cargará al contactar a un cliente.</p></div></header>
    <section className="flat-section settings-section">
      <header><div><p className="eyebrow">WHATSAPP</p><h2>Mensaje base al cliente</h2></div><MessageCircle /></header>
      {settings.isPending ? <div className="panel-loading">Cargando configuración…</div> : <form className="settings-form" onSubmit={submit}>
        <div className="settings-field-head"><label htmlFor="base-message">Mensaje base</label><span>{message.length}/500</span></div>
        <textarea id="base-message" value={message} onChange={(event) => { setMessage(event.target.value); setSaved(false); }} rows={4} maxLength={500} required />
        <div className="settings-form-footer"><p>Se aplicará a todos los botones de WhatsApp.</p><button className="button primary" disabled={update.isPending || !message.trim()}>{update.isPending ? "Guardando…" : "Guardar cambios"}</button></div>
        {update.error && <p className="form-error">{update.error.message}</p>}
        {saved && <p className="settings-success" role="status"><CheckCircle2 /> Mensaje guardado y disponible para todos los clientes.</p>}
      </form>}
    </section>
  </div>;
}
