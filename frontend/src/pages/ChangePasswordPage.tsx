import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { api } from "../lib/api";
import { BrandLogo } from "../components/BrandLogo";

export function ChangePasswordPage({ onChanged }: { onChanged: () => void }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget);
    if (data.get("new_password") !== data.get("confirmation")) { setError("La confirmación no coincide."); setBusy(false); return; }
    try { await api("/auth/change-password/", { method: "POST", body: JSON.stringify({ current_password: data.get("current_password"), new_password: data.get("new_password") }) }); onChanged(); }
    catch (exception) { setError(exception instanceof Error ? exception.message : "No se pudo cambiar la contraseña."); }
    finally { setBusy(false); }
  };
  return <div className="login-page password-page"><section className="login-identity"><div className="login-brand"><BrandLogo /></div><div><p className="eyebrow light">PRIMER INGRESO</p><h1>Protegé<br /><em>tu cuenta.</em></h1><p>Antes de comenzar, reemplazá la clave temporal por una contraseña personal.</p></div><div className="login-signals"><span><KeyRound /> Mínimo 12 caracteres</span></div></section><section className="login-form-wrap"><form className="login-form" onSubmit={submit}><div className="login-icon"><KeyRound /></div><p className="eyebrow">CAMBIO OBLIGATORIO</p><h2>Elegí tu contraseña</h2><p className="muted">No uses datos personales ni contraseñas conocidas.</p><label>Contraseña temporal<input name="current_password" type="password" autoComplete="current-password" required /></label><label>Nueva contraseña<input name="new_password" type="password" minLength={12} autoComplete="new-password" required /></label><label>Repetir nueva contraseña<input name="confirmation" type="password" minLength={12} autoComplete="new-password" required /></label>{error && <p className="form-error">{error}</p>}<button className="button primary large" disabled={busy}>Guardar y continuar <ArrowRight /></button></form></section></div>;
}
