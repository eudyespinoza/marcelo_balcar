/* @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { mobileNavigationGroups, navigationForUser } from "./Layout";

describe("navigationForUser", () => {
  it("keeps a technician focused on assigned services even with administrative roles", () => {
    const links = navigationForUser({
      roles: ["Superadmin", "Administrador", "Coordinador", "Técnico"],
      permissions: ["operations.view_dashboard", "operations.manage_users"],
      is_technician: true
    });

    expect(links.map((link) => link.label)).toEqual(["Mis servicios"]);
  });

  it("keeps an exclusively technical account focused on its assigned work", () => {
    const links = navigationForUser({ roles: ["Técnico"], permissions: ["operations.view_service"], is_technician: true });

    expect(links.map((link) => link.label)).toEqual(["Mis servicios"]);
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
