import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DashboardAccountList } from "./DashboardAccountsDialog";

describe("DashboardAccountList", () => {
  it("renders each outstanding account as a direct link to the client", () => {
    const markup = renderToStaticMarkup(<MemoryRouter><DashboardAccountList
      label="Saldos pendientes"
      accounts={[{ id: "client-123", name: "Cliente de prueba", is_delinquent: true, outstanding_balance: "1250.00" }]}
      onSelect={() => undefined}
    /></MemoryRouter>);

    expect(markup).toContain("Saldos pendientes");
    expect(markup).toContain("Cliente de prueba");
    expect(markup).toContain("Cliente en mora");
    expect(markup).toContain('href="/clientes/client-123"');
    expect(markup).toContain("1.250,00");
  });
});
