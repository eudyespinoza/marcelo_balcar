import { useState, type FormEvent } from "react";
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
  return <div className="login-page login-page-simple password-page">
    <section className="login-form-wrap">
      <form className="login-form" onSubmit={submit}>
        <div className="login-form-brand"><BrandLogo /></div>
        <h2>Cambiar contraseña</h2>
        <label>Contraseña temporal<input name="current_password" type="password" autoComplete="current-password" required /></label>
        <label>Nueva contraseña (mínimo 12 caracteres)<input name="new_password" type="password" minLength={12} autoComplete="new-password" required /></label>
        <label>Repetir nueva contraseña<input name="confirmation" type="password" minLength={12} autoComplete="new-password" required /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="button primary large" disabled={busy}>{busy ? "Guardando…" : "Guardar y continuar"}</button>
      </form>
    </section>
  </div>;
}
