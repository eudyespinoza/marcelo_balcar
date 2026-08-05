import { useState } from "react";
import { AlertTriangle, Banknote, ChevronRight, CircleCheckBig, Plus, ReceiptText, WalletCards } from "lucide-react";
import { currency, dateTime } from "../lib/format";
import type { ClientAccount } from "../types";
import { MoneyValue } from "./MoneyValue";
import { StatusBadge } from "./StatusBadge";
import { ClientPaymentDialog } from "./ClientPaymentDialog";

export function ClientAccountSection({ account, pending, clientName = "Cliente", canManagePayments = false, onSelectService }: {
  account?: ClientAccount;
  pending: boolean;
  clientName?: string;
  canManagePayments?: boolean;
  onSelectService: (serviceId: string) => void;
}) {
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [paymentServiceId, setPaymentServiceId] = useState<string | undefined>();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState("");

  if (pending) return <section className="client-account-section client-account-loading" aria-busy="true" aria-label="Cargando cuenta corriente"><span /></section>;
  if (!account) return null;

  const displayedPayments = showAllPayments ? account.payments : account.payments.slice(0, 5);
  const hasOutstanding = Number(account.outstanding_total) > 0;
  const statusLabel = account.is_delinquent ? "Marcado en mora" : hasOutstanding ? "Con saldo pendiente" : "Al día";

  return <section className={`client-account-section${account.is_delinquent ? " is-delinquent" : ""}`} aria-labelledby="client-account-title">
    <header>
      <div><p className="eyebrow">CUENTA CORRIENTE</p><h2 id="client-account-title">Estado financiero</h2></div>
      <div className="client-account-header-actions">
        <span className={`client-account-state ${account.is_delinquent ? "danger" : hasOutstanding ? "warning" : "success"}`}>
          {account.is_delinquent ? <AlertTriangle /> : hasOutstanding ? <WalletCards /> : <CircleCheckBig />}
          {statusLabel}
        </span>
        {canManagePayments && hasOutstanding && <button type="button" className="button primary" onClick={() => { setPaymentServiceId(undefined); setPaymentNotice(""); setPaymentDialogOpen(true); }}><Plus /> Registrar pago</button>}
      </div>
    </header>

    {paymentNotice && <div className="client-account-payment-notice" role="status"><CircleCheckBig /> {paymentNotice}</div>}

    <div className="client-account-summary" aria-label="Resumen financiero del cliente">
      <article className="client-account-primary"><span>Saldo pendiente</span><MoneyValue as="strong" value={currency(account.outstanding_total)} /><small>{account.outstanding_services.length} {account.outstanding_services.length === 1 ? "servicio con saldo" : "servicios con saldo"}</small></article>
      <article><span>Total facturado</span><MoneyValue as="strong" value={currency(account.billed_total)} /><small>Servicios no cancelados</small></article>
      <article><span>Total cobrado</span><MoneyValue as="strong" value={currency(account.collected_total)} /><small>Pagos no anulados</small></article>
      <article><span>Último pago</span>{account.last_payment ? <><MoneyValue as="strong" value={currency(account.last_payment.amount)} /><small>{dateTime(account.last_payment.paid_at)} · {account.last_payment.method_name}</small></> : <><strong>Sin pagos</strong><small>No hay cobros registrados</small></>}</article>
    </div>

    {account.is_delinquent && !hasOutstanding && <div className="client-account-note"><AlertTriangle /><span>El cliente está marcado en mora, pero no tiene saldo pendiente registrado.</span></div>}

    <div className="client-account-detail">
      <section aria-labelledby="outstanding-services-title">
        <header><div><p className="eyebrow">DEUDA ABIERTA</p><h3 id="outstanding-services-title">Servicios con saldo</h3></div><span>{account.outstanding_services.length}</span></header>
        <div className="client-account-service-list">
          {account.outstanding_services.map((service) => <article className="client-account-service-row" key={service.id}>
            <button className="client-account-service-open" onClick={() => onSelectService(service.id)} aria-label={`Abrir cobranza de ${service.description}`}>
              <span className="client-account-service-copy"><strong>Orden {service.id.slice(0, 8).toUpperCase()}</strong><small>{service.description || "Servicio sin descripción"}</small><em>{dateTime(service.scheduled_at)}</em></span>
              <StatusBadge status={service.status} />
              <span className="client-account-service-money"><MoneyValue as="strong" value={currency(service.balance)} /><small>{currency(service.paid_amount)} cobrado</small></span>
              <ChevronRight />
            </button>
            {canManagePayments && <button type="button" className="client-account-service-pay" onClick={() => { setPaymentServiceId(service.id); setPaymentNotice(""); setPaymentDialogOpen(true); }}><Banknote /> Registrar pago</button>}
          </article>)}
          {!account.outstanding_services.length && <div className="client-account-empty"><CircleCheckBig /><strong>Sin servicios con saldo</strong><p>Los servicios facturados están completamente cobrados.</p></div>}
        </div>
      </section>

      <section aria-labelledby="client-payments-title">
        <header><div><p className="eyebrow">MOVIMIENTOS</p><h3 id="client-payments-title">Pagos del cliente</h3></div><span>{account.payments.length}</span></header>
        <div className="client-account-payment-list">
          {displayedPayments.map((payment) => <button className={payment.voided_at ? "voided" : ""} key={payment.id} onClick={() => onSelectService(payment.service)} aria-label={`Abrir pago de ${payment.service_description || "servicio"}`}>
            <Banknote />
            <span><strong>{payment.method_name}</strong><small>Orden {payment.service.slice(0, 8).toUpperCase()} · {dateTime(payment.paid_at)}</small>{payment.voided_at && <em>Anulado · {payment.void_reason}</em>}</span>
            <MoneyValue as="strong" value={currency(payment.amount)} />
            <ChevronRight />
          </button>)}
          {!account.payments.length && <div className="client-account-empty"><ReceiptText /><strong>Sin movimientos</strong><p>Todavía no se registraron pagos para este cliente.</p></div>}
        </div>
        {account.payments.length > 5 && <button type="button" className="client-account-more" onClick={() => setShowAllPayments((value) => !value)}>{showAllPayments ? "Ver menos movimientos" : `Ver los ${account.payments.length} movimientos`}</button>}
      </section>
    </div>
    {paymentDialogOpen && <ClientPaymentDialog account={account} clientName={clientName} initialServiceId={paymentServiceId} onClose={() => setPaymentDialogOpen(false)} onSaved={() => { setPaymentDialogOpen(false); setPaymentNotice("Pago registrado correctamente. La cuenta corriente, el dashboard y Caja fueron actualizados."); }} />}
  </section>;
}
