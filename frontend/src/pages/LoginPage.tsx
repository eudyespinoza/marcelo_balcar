import { useState, type FormEvent } from "react";
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
  return <div className="login-page login-page-simple">
    <section className="login-form-wrap">
      <form onSubmit={submit} className="login-form">
        <div className="login-form-brand"><BrandLogo /></div>
        <h2>Ingresar</h2>
        <label>Usuario<input name="username" autoComplete="username" required autoFocus /></label>
        <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="button primary large" disabled={busy}>{busy ? "Verificando…" : "Ingresar"}</button>
      </form>
    </section>
  </div>;
}
