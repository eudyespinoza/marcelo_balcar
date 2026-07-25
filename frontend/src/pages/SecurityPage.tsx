import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, KeyRound, LogOut, Plus, ShieldCheck, UserCheck, UserRoundCog, Users } from "lucide-react";
import { api, resultList } from "../lib/api";
import type { Permission, Role, Technician, User } from "../types";
import { Modal } from "../components/Modal";

type SecurityTab = "users" | "roles" | "technicians";

export function SecurityPage({ permissions: currentPermissions }: { permissions: string[] }) {
  const canUsers = currentPermissions.includes("operations.manage_users"); const canRoles = currentPermissions.includes("operations.manage_roles");
  const [tab, setTab] = useState<SecurityTab>(canUsers ? "users" : "roles"); const [createUser, setCreateUser] = useState(false); const [selectedUser, setSelectedUser] = useState<User | null>(null); const [selectedRole, setSelectedRole] = useState<Role | null>(null); const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: async () => resultList(await api<User[] | { results: User[] }>("/users/")), enabled: canUsers });
  const roles = useQuery({ queryKey: ["roles"], queryFn: async () => resultList(await api<Role[] | { results: Role[] }>("/roles/")) });
  const permissions = useQuery({ queryKey: ["permissions"], queryFn: () => api<Permission[]>("/permissions/"), enabled: canRoles });
  const technicians = useQuery({ queryKey: ["technicians"], queryFn: async () => resultList(await api<Technician[] | { results: Technician[] }>("/technicians/")), enabled: canUsers });
  const mutate = useMutation({ mutationFn: ({ path, method, body }: { path: string; method: string; body?: Record<string, unknown> }) => api(path, { method, body: body ? JSON.stringify(body) : undefined }), onSuccess: () => { setCreateUser(false); setSelectedUser(null); setSelectedRole(null); void queryClient.invalidateQueries({ queryKey: ["users"] }); void queryClient.invalidateQueries({ queryKey: ["roles"] }); void queryClient.invalidateQueries({ queryKey: ["technicians"] }); } });
  const submitUser = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); mutate.mutate({ path: "/users/", method: "POST", body: { username: data.get("username"), first_name: data.get("first_name"), last_name: data.get("last_name"), email: data.get("email"), phone: data.get("phone"), password: data.get("password"), role_ids: data.getAll("role_ids"), is_active: true, must_change_password: true } }); };
  const updateUser = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selectedUser) return; const data = new FormData(event.currentTarget); const password = String(data.get("password") ?? ""); mutate.mutate({ path: `/users/${selectedUser.id}/`, method: "PATCH", body: { first_name: data.get("first_name"), last_name: data.get("last_name"), email: data.get("email"), phone: data.get("phone"), role_ids: data.getAll("role_ids"), is_active: data.get("is_active") === "on", ...(password ? { password } : {}) } }); };
  const toggleTechnician = (tech: Technician) => mutate.mutate({ path: `/technicians/${tech.id}/`, method: "PATCH", body: { active: !tech.active } });
  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">CONTROL DE ACCESO</p><h1>Usuarios y permisos</h1><p>La matriz se aplica también sobre cada endpoint de la API.</p></div>{canUsers && tab === "users" && <button className="button primary" onClick={() => setCreateUser(true)}><Plus /> Nuevo usuario</button>}</header>
    <div className="section-tabs">{canUsers && <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Users /> Usuarios</button>}{canRoles && <button className={tab === "roles" ? "active" : ""} onClick={() => setTab("roles")}><ShieldCheck /> Roles y matriz</button>}{canUsers && <button className={tab === "technicians" ? "active" : ""} onClick={() => setTab("technicians")}><UserRoundCog /> Técnicos</button>}</div>
    {tab === "users" && <section className="security-list"><div className="security-row table-head"><span>Usuario</span><span>Roles</span><span>Contacto</span><span>Estado</span><span /></div>{users.data?.map((user) => <div className="security-row" key={user.id}><span><i className="user-initial">{user.username.charAt(0).toUpperCase()}</i><b>{user.first_name || user.username} {user.last_name}</b><small>@{user.username}</small></span><span>{user.roles.map((role) => <em key={role}>{role}</em>)}</span><span>{user.email || user.phone || "Sin contacto"}</span><span className={user.is_active ? "active-user" : "inactive-user"}><UserCheck /> {user.is_active ? "Activo" : "Inactivo"}</span><span className="row-actions"><button className="icon-button" title="Editar" onClick={() => setSelectedUser(user)}><Edit3 /></button><button className="icon-button" title="Revocar sesiones" onClick={() => mutate.mutate({ path: `/users/${user.id}/revoke-sessions/`, method: "POST", body: {} })}><LogOut /></button></span></div>)}</section>}
    {tab === "roles" && <section className="roles-layout"><aside>{roles.data?.map((role) => <button key={role.id} onClick={() => setSelectedRole(role)} className={selectedRole?.id === role.id ? "active" : ""}><ShieldCheck /><span><strong>{role.name}</strong><small>{role.users_count} {role.users_count === 1 ? "usuario" : "usuarios"} · {role.permissions.length} permisos</small></span></button>)}</aside><div>{selectedRole ? <RoleMatrix role={selectedRole} permissions={permissions.data ?? []} onSave={(ids) => mutate.mutate({ path: `/roles/${selectedRole.id}/`, method: "PATCH", body: { permission_ids: ids } })} busy={mutate.isPending} /> : <div className="security-placeholder"><KeyRound /><h2>Elegí un rol</h2><p>Revisá y modificá sus capacidades efectivas.</p></div>}</div></section>}
    {tab === "technicians" && <section className="technician-admin"><div className="inline-alert warning">Los perfiles históricos se importan inactivos. Activá solo los que estén vinculados a una cuenta verificada.</div>{technicians.data?.map((tech) => <div key={tech.id}><span className="user-initial">{tech.display_name.charAt(0)}</span><span><strong>{tech.display_name}</strong><small>{tech.username ? `@${tech.username}` : "Sin cuenta vinculada"}</small></span><button className={`switch ${tech.active ? "on" : ""}`} onClick={() => toggleTechnician(tech)} aria-label={tech.active ? "Desactivar" : "Activar"}><i /></button></div>)}</section>}
    {createUser && <Modal title="Nuevo usuario" onClose={() => setCreateUser(false)}><form className="form-stack" onSubmit={submitUser}><div className="form-grid"><label>Nombre<input name="first_name" required /></label><label>Apellido<input name="last_name" required /></label></div><label>Usuario<input name="username" required autoComplete="off" /></label><div className="form-grid"><label>Email<input name="email" type="email" /></label><label>Teléfono<input name="phone" /></label></div><label>Contraseña temporal<input name="password" type="password" minLength={12} required autoComplete="new-password" /></label><fieldset><legend>Roles</legend><div className="checkbox-list">{roles.data?.map((role) => <label key={role.id}><input type="checkbox" name="role_ids" value={role.id} />{role.name}</label>)}</div></fieldset>{mutate.error && <p className="form-error">{mutate.error.message}</p>}<div className="form-actions"><button className="button ghost" type="button" onClick={() => setCreateUser(false)}>Cancelar</button><button className="button primary" disabled={mutate.isPending}>Crear usuario</button></div></form></Modal>}
    {selectedUser && <Modal title={`Editar @${selectedUser.username}`} onClose={() => setSelectedUser(null)}><form className="form-stack" onSubmit={updateUser}><div className="form-grid"><label>Nombre<input name="first_name" defaultValue={selectedUser.first_name} required /></label><label>Apellido<input name="last_name" defaultValue={selectedUser.last_name} /></label></div><div className="form-grid"><label>Email<input name="email" type="email" defaultValue={selectedUser.email} /></label><label>Teléfono<input name="phone" defaultValue={selectedUser.phone} /></label></div><label>Nueva contraseña temporal (opcional)<input name="password" type="password" minLength={12} autoComplete="new-password" /></label><fieldset><legend>Roles</legend><div className="checkbox-list">{roles.data?.map((role) => <label key={role.id}><input type="checkbox" name="role_ids" value={role.id} defaultChecked={selectedUser.roles.includes(role.name)} />{role.name}</label>)}</div></fieldset><label className="check-line"><input type="checkbox" name="is_active" defaultChecked={selectedUser.is_active} /> Cuenta activa</label>{mutate.error && <p className="form-error">{mutate.error.message}</p>}<div className="form-actions"><button type="button" className="button ghost" onClick={() => setSelectedUser(null)}>Cancelar</button><button className="button primary" disabled={mutate.isPending}>Guardar cambios</button></div></form></Modal>}
  </div>;
}

function RoleMatrix({ role, permissions, onSave, busy }: { role: Role; permissions: Permission[]; onSave: (ids: number[]) => void; busy: boolean }) {
  const [selected, setSelected] = useState(() => new Set(role.permissions.map((permission) => permission.id)));
  useEffect(() => setSelected(new Set(role.permissions.map((permission) => permission.id))), [role]);
  const grouped = useMemo(() => {
    const result = new Map<string, Permission[]>();
    for (const permission of permissions) result.set(permission.model, [...(result.get(permission.model) ?? []), permission]);
    return result;
  }, [permissions]);
  const toggle = (id: number) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  return <div className="role-matrix"><header><div><p className="eyebrow">MATRIZ EFECTIVA</p><h2>{role.name}</h2></div><button className="button primary" disabled={busy} onClick={() => onSave([...selected])}>Guardar permisos</button></header>{[...grouped.entries()].map(([model, items]) => <section key={model}><h3>{modelLabel(model)}</h3><div>{items.map((permission) => <label key={permission.id}><input type="checkbox" checked={selected.has(permission.id)} onChange={() => toggle(permission.id)} /><span><b>{permissionLabel(permission)}</b><small>{permission.codename}</small></span></label>)}</div></section>)}</div>;
}

const MODEL_LABELS: Record<string, { singular: string; plural: string }> = {
  address: { singular: "dirección", plural: "Direcciones" },
  auditevent: { singular: "evento de auditoría", plural: "Auditoría" },
  client: { singular: "cliente", plural: "Clientes" },
  dataissue: { singular: "incidencia de datos", plural: "Incidencias de migración" },
  migrationrun: { singular: "ejecución de migración", plural: "Ejecuciones de migración" },
  payment: { singular: "pago", plural: "Pagos" },
  paymentmethod: { singular: "medio de pago", plural: "Medios de pago" },
  pushsubscription: { singular: "suscripción push", plural: "Notificaciones push" },
  service: { singular: "servicio", plural: "Servicios" },
  serviceevent: { singular: "evento del servicio", plural: "Historial de servicios" },
  servicephoto: { singular: "foto del servicio", plural: "Fotos de servicios" },
  syncconflict: { singular: "conflicto offline", plural: "Conflictos offline" },
  syncoperation: { singular: "operación offline", plural: "Operaciones offline" },
  technicianprofile: { singular: "técnico", plural: "Técnicos" },
  user: { singular: "usuario", plural: "Usuarios" }
};

function modelLabel(model: string) {
  return MODEL_LABELS[model]?.plural ?? model.replaceAll("_", " ");
}

function permissionLabel(permission: Permission) {
  const noun = MODEL_LABELS[permission.model]?.singular;
  if (!noun) return permission.name;
  if (permission.codename.startsWith("add_")) return `Crear ${noun}`;
  if (permission.codename.startsWith("change_")) return `Editar ${noun}`;
  if (permission.codename.startsWith("delete_")) return `${["address", "client", "service"].includes(permission.model) ? "Archivar" : "Eliminar"} ${noun}`;
  if (permission.codename.startsWith("view_") && permission.name.startsWith("Can view")) return `Ver ${noun}`;
  return permission.name;
}
