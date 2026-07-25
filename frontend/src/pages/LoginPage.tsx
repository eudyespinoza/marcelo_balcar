import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck, WifiOff } from "lucide-react";
import { api } from "../lib/api";
import { BrandLogo } from "../components/BrandLogo";

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/auth/login/", { method: "POST", body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
      onLogin();
    } catch (exception) { setError(exception instanceof Error ? exception.message : "No se pudo iniciar sesión."); }
    finally { setBusy(false); }
  };
  return <div className="login-page">
    <section className="login-identity">
      <div className="login-brand"><BrandLogo /></div>
      <div><p className="eyebrow light">CENTRO DE OPERACIONES</p><h1>El trabajo del día,<br /><em>bajo control.</em></h1><p>Agenda, equipos y servicios conectados desde el taller hasta cada domicilio.</p></div>
      <div className="login-signals"><span><ShieldCheck /> Acceso por rol</span><span><WifiOff /> Trabajo sin conexión</span></div>
    </section>
    <section className="login-form-wrap">
      <form onSubmit={submit} className="login-form">
        <div className="login-icon"><LockKeyhole /></div>
        <p className="eyebrow">ACCESO SEGURO</p><h2>Ingresá a operaciones</h2><p className="muted">Usá las credenciales asignadas por administración.</p>
        <label>Usuario<input name="username" autoComplete="username" required autoFocus /></label>
        <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="button primary large" disabled={busy}>{busy ? "Verificando…" : "Ingresar"}<ArrowRight /></button>
        <small>La sesión se protege y se cierra al revocarla desde administración.</small>
      </form>
    </section>
  </div>;
}
