import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChangePasswordPage } from "./ChangePasswordPage";

describe("ChangePasswordPage", () => {
  it("keeps the first-login screen limited to required controls", () => {
    const html = renderToStaticMarkup(<ChangePasswordPage onChanged={() => undefined} />);

    expect(html).toContain("Contraseña temporal");
    expect(html).toContain("mínimo 12 caracteres");
    expect(html).toContain("Guardar y continuar");
    expect(html).not.toContain("Protegé");
    expect(html).not.toContain("CAMBIO OBLIGATORIO");
  });
});
