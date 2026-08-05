import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClientAccountService } from "../types";
import { buildClientPaymentPayload, ClientPaymentForm } from "./ClientPaymentDialog";

const service: ClientAccountService = {
  id: "12345678-service",
  description: "Portón principal",
  scheduled_at: "2026-08-05T12:00:00Z",
  status: "COMPLETED",
  status_label: "Finalizado",
  amount_due: "1000.00",
  paid_amount: "400.00",
  balance: "600.00",
  payment_status: "PARTIAL"
};

describe("ClientPaymentForm", () => {
  it("shows the allocation, balance and complete payment fields", () => {
    const markup = renderToStaticMarkup(<ClientPaymentForm
      clientName="Cliente de prueba"
      services={[service]}
      selectedService={service}
      methods={[{ id: "cash", name: "Efectivo" }]}
      methodsPending={false}
      pending={false}
      onServiceChange={() => undefined}
      onSubmit={() => undefined}
      onCancel={() => undefined}
    />);

    expect(markup).toContain("Aplicar al servicio");
    expect(markup).toContain("Orden 12345678");
    expect(markup).toContain("Saldo disponible");
    expect(markup).toContain('name="amount"');
    expect(markup).toContain('max="600.00"');
    expect(markup).toContain('name="paid_at"');
    expect(markup).toContain('name="method"');
    expect(markup).toContain("Registrar cobro");
  });

  it("builds a payment tied to the selected service", () => {
    const data = new FormData();
    data.set("amount", "250.00");
    data.set("method", "cash");
    data.set("paid_at", "2026-08-05T14:30");
    data.set("note", "Recibo 15");

    expect(buildClientPaymentPayload(service.id, data)).toEqual({
      service: service.id,
      amount: "250.00",
      method: "cash",
      paid_at: "2026-08-05T17:30:00.000Z",
      note: "Recibo 15"
    });
  });
});
