/* @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { isTechnicianOnly, mobileNavigationGroups, navigationForUser } from "./Layout";

describe("navigationForUser", () => {
  it("combines all administrative menus with assigned services for a mixed account", () => {
    const links = navigationForUser({
      roles: ["Superadmin", "Administrador", "Coordinador", "Técnico"],
      permissions: [
        "operations.view_dashboard", "operations.view_client", "operations.view_service",
        "operations.view_daily_cash", "operations.view_dataissue", "operations.manage_users",
        "operations.change_applicationsettings"
      ],
      is_technician: true
    });

    expect(links.map((link) => link.label)).toEqual([
      "Operación", "Dashboard", "Clientes", "Mis servicios", "Agenda", "Caja", "Incidencias", "Seguridad", "Configuración"
    ]);
  });

  it("keeps an exclusively technical account focused on its assigned work", () => {
    const user = { roles: ["Técnico"], permissions: ["operations.view_service"], is_technician: true };
    const links = navigationForUser(user);

    expect(links.map((link) => link.label)).toEqual(["Mis servicios"]);
    expect(isTechnicianOnly(user)).toBe(true);
  });

  it("does not classify an administrative technician as technician-only", () => {
    expect(isTechnicianOnly({ permissions: ["operations.view_dashboard"], is_technician: true })).toBe(false);
  });

  it("does not expose the technical workspace without the Técnico role", () => {
    const links = navigationForUser({ roles: ["Administrador"], permissions: ["operations.view_dashboard"], is_technician: false });

    expect(links.map((link) => link.label)).toEqual(["Operación", "Dashboard"]);
  });

  it("shows Configuración only to users allowed to change it", () => {
    const links = navigationForUser({
      roles: ["Administrador"],
      permissions: ["operations.view_dashboard", "operations.change_applicationsettings"],
      is_technician: false
    });

    expect(links.map((link) => link.label)).toEqual(["Operación", "Dashboard", "Configuración"]);
  });
});

describe("mobileNavigationGroups", () => {
  it("keeps the bottom bar usable and moves extra sections into More", () => {
    const labels = ["Operación", "Dashboard", "Clientes", "Agenda", "Caja", "Incidencias", "Seguridad", "Configuración"];
    const grouped = mobileNavigationGroups(labels);

    expect(grouped.primary).toEqual(["Operación", "Dashboard", "Clientes", "Agenda"]);
    expect(grouped.overflow).toEqual(["Caja", "Incidencias", "Seguridad", "Configuración"]);
  });
});
