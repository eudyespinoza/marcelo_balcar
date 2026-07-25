import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoginPage } from "./LoginPage";

describe("LoginPage", () => {
  it("shows only the internal access controls", () => {
    const html = renderToStaticMarkup(<LoginPage onLogin={() => undefined} />);

    expect(html).toContain("Usuario");
    expect(html).toContain("Contraseña");
    expect(html).toContain("Ingresar");
    expect(html).not.toContain("CENTRO DE OPERACIONES");
    expect(html).not.toContain("El trabajo del día");
    expect(html).not.toContain("Acceso por rol");
  });
});
