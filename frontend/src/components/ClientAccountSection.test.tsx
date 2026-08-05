import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClientAccount } from "../types";
import { ClientAccountSection } from "./ClientAccountSection";

const account: ClientAccount = {
  client: "client-1",
  is_delinquent: true,
  billed_total: "1000.00",
  collected_total: "400.00",
  outstanding_total: "600.00",
  last_payment: {
    id: "payment-1",
    service: "12345678-service",
    amount: "400.00",
    method: "cash",
    method_name: "Efectivo",
    paid_at: "2026-08-05T12:00:00Z",
    note: "",
    recorded_by_name: "Operador",
    voided_at: null,
    void_reason: "",
    service_description: "Portón principal"
  },
  outstanding_services: [{
    id: "12345678-service",
    description: "Portón principal",
    scheduled_at: "2026-08-01T12:00:00Z",
    status: "COMPLETED",
    status_label: "Finalizado",
    amount_due: "1000.00",
    paid_amount: "400.00",
    balance: "600.00",
    payment_status: "PARTIAL"
  }],
  payments: []
};

describe("ClientAccountSection", () => {
  it("shows the client totals and links an outstanding service to billing", () => {
    const markup = renderToStaticMarkup(<ClientAccountSection account={account} pending={false} clientName="Cliente en mora" canManagePayments onSelectService={() => undefined} />);

    expect(markup).toContain("CUENTA CORRIENTE");
    expect(markup).toContain("Marcado en mora");
    expect(markup).toContain("600,00");
    expect(markup).toContain("1.000,00");
    expect(markup).toContain('aria-label="Abrir cobranza de Portón principal"');
    expect(markup).toContain("400,00 cobrado");
    expect(markup.match(/Registrar pago/g)).toHaveLength(2);
  });

  it("explains a manual delinquency flag without financial debt", () => {
    const markup = renderToStaticMarkup(<ClientAccountSection account={{ ...account, billed_total: "0.00", collected_total: "0.00", outstanding_total: "0.00", last_payment: null, outstanding_services: [] }} pending={false} onSelectService={() => undefined} />);

    expect(markup).toContain("marcado en mora, pero no tiene saldo pendiente");
    expect(markup).toContain("Sin servicios con saldo");
  });
});
