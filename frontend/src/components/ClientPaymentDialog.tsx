import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CalendarClock, CheckCircle2, ReceiptText } from "lucide-react";
import { api, resultList } from "../lib/api";
import { argentinaWallTimeToIso, currency, dateTime, inputDateTime } from "../lib/format";
import type { ClientAccount, ClientAccountService, Payment } from "../types";
import { Modal } from "./Modal";
import { MoneyValue } from "./MoneyValue";

interface PaymentMethodOption {
  id: string;
  name: string;
}

export function buildClientPaymentPayload(serviceId: string, data: FormData) {
  return {
    service: serviceId,
    amount: data.get("amount"),
    method: data.get("method"),
    paid_at: argentinaWallTimeToIso(String(data.get("paid_at") ?? "")),
    note: data.get("note")
  };
}

export function ClientPaymentDialog({ account, clientName, initialServiceId, onClose, onSaved }: {
  account: ClientAccount;
  clientName: string;
  initialServiceId?: string;
  onClose: () => void;
  onSaved: (payment: Payment) => void;
}) {
  const queryClient = useQueryClient();
  const firstServiceId = account.outstanding_services[0]?.id ?? "";
  const [serviceId, setServiceId] = useState(
    account.outstanding_services.some((service) => service.id === initialServiceId) ? initialServiceId! : firstServiceId
  );
  const selectedService = account.outstanding_services.find((service) => service.id === serviceId);
  const methods = useQuery({
    queryKey: ["payment-methods"],
    queryFn: async () => resultList(await api<PaymentMethodOption[] | { results: PaymentMethodOption[] }>("/payment-methods/"))
  });
  const payment = useMutation({
    mutationFn: (body: ReturnType<typeof buildClientPaymentPayload>) => api<Payment>("/payments/", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-account", account.client] }),
        queryClient.invalidateQueries({ queryKey: ["service", created.service] }),
        queryClient.invalidateQueries({ queryKey: ["services"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["cash"] })
      ]);
      onSaved(created);
    }
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedService) return;
    payment.mutate(buildClientPaymentPayload(selectedService.id, new FormData(event.currentTarget)));
  };

  return <Modal title="Registrar pago" onClose={onClose}>
    <ClientPaymentForm
      key={selectedService?.id ?? "no-service"}
      clientName={clientName}
      services={account.outstanding_services}
      selectedService={selectedService}
      methods={methods.data ?? []}
      methodsPending={methods.isPending}
      pending={payment.isPending}
      error={payment.error?.message}
      onServiceChange={setServiceId}
      onSubmit={submit}
      onCancel={onClose}
    />
  </Modal>;
}

export function ClientPaymentForm({ clientName, services, selectedService, methods, methodsPending, pending, error, onServiceChange, onSubmit, onCancel }: {
  clientName: string;
  services: ClientAccountService[];
  selectedService?: ClientAccountService;
  methods: PaymentMethodOption[];
  methodsPending: boolean;
  pending: boolean;
  error?: string;
  onServiceChange: (serviceId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  if (!selectedService) return <div className="client-payment-empty">
    <ReceiptText />
    <strong>No hay servicios con saldo pendiente</strong>
    <p>Definí el importe total de un servicio antes de registrar un cobro.</p>
    <button type="button" className="button secondary" onClick={onCancel}>Cerrar</button>
  </div>;

  return <form className="client-payment-form" onSubmit={onSubmit}>
    <div className="client-payment-context">
      <Banknote />
      <span><small>CLIENTE</small><strong>{clientName}</strong></span>
    </div>

    <label>Aplicar al servicio
      <select name="service" value={selectedService.id} onChange={(event) => onServiceChange(event.target.value)} required>
        {services.map((service) => <option key={service.id} value={service.id}>Orden {service.id.slice(0, 8).toUpperCase()} · {service.description}</option>)}
      </select>
      <small className="field-help">El pago quedará asociado a este servicio y a su cliente.</small>
    </label>

    <div className="client-payment-balance" aria-live="polite">
      <div><span>Total</span><MoneyValue as="strong" value={currency(selectedService.amount_due)} /></div>
      <div><span>Cobrado</span><MoneyValue as="strong" value={currency(selectedService.paid_amount)} /></div>
      <div className="is-balance"><span>Saldo disponible</span><MoneyValue as="strong" value={currency(selectedService.balance)} /></div>
      <small><CalendarClock /> {dateTime(selectedService.scheduled_at)} · {selectedService.status_label}</small>
    </div>

    <div className="form-grid">
      <label>Importe
        <input name="amount" type="number" inputMode="decimal" min="0.01" max={selectedService.balance} step="0.01" required autoFocus />
        <small className="field-help">Máximo {currency(selectedService.balance)}</small>
      </label>
      <label>Fecha y hora
        <input name="paid_at" type="datetime-local" defaultValue={inputDateTime(new Date().toISOString())} required />
      </label>
    </div>

    <label>Medio de pago
      <select name="method" required disabled={methodsPending || !methods.length}>
        <option value="">{methodsPending ? "Cargando medios…" : "Seleccionar"}</option>
        {methods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
      </select>
      {!methodsPending && !methods.length && <small className="field-error">No hay medios de pago activos.</small>}
    </label>

    <label>Nota <small className="optional-label">Opcional</small>
      <input name="note" maxLength={300} placeholder="Referencia, recibo u observación" />
    </label>

    {error && <div className="inline-alert danger" role="alert">{error}</div>}
    <div className="form-actions">
      <button type="button" className="button ghost" onClick={onCancel}>Cancelar</button>
      <button className="button primary" disabled={pending || methodsPending || !methods.length}>
        <CheckCircle2 /> {pending ? "Registrando…" : "Registrar cobro"}
      </button>
    </div>
  </form>;
}
