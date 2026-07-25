import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Download, ReceiptText, RotateCcw, WalletCards } from "lucide-react";
import { api } from "../lib/api";
import { argentinaDateKey, currency, dateTime } from "../lib/format";
import type { CashReport } from "../types";

export function CashPage() {
  const [date, setDate] = useState(() => argentinaDateKey());
  const report = useQuery({ queryKey: ["cash", date], queryFn: () => api<CashReport>(`/reports/daily-cash/?date=${date}`) });
  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">COBRANZA</p><h1>Caja diaria</h1><p>Pagos efectivos por fecha y medio. Las anulaciones quedan visibles.</p></div><div className="cash-actions"><label>Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><a className="button secondary" href={`/api/v1/reports/daily-cash/?date=${date}&export=csv`}><Download /> Exportar CSV</a></div></header>
    <section className="cash-summary"><div><span>Total neto</span><strong>{currency(report.data?.total)}</strong><small>{report.data?.payments.length ?? 0} movimientos relacionados</small></div><div><span>Anulado en el día</span><strong>{currency(report.data?.voided_total)}</strong><small>Conservado para auditoría</small></div><div className="cash-methods"><span>Distribución neta por medio</span>{report.data?.by_method.map((item) => <p key={item.method__name}><b>{item.method__name}</b><span>{item.movements} mov.</span><strong>{currency(item.total)}</strong></p>)}</div></section>
    <section className="flat-section"><header><div><p className="eyebrow">MOVIMIENTOS</p><h2>Detalle del día</h2></div></header><div className="payment-table"><div className="payment-row table-head"><span>Hora</span><span>Servicio</span><span>Medio</span><span>Usuario</span><span>Importe</span></div>{report.data?.payments.map((payment) => <div key={payment.id} className={`payment-row ${payment.voided_at ? "voided" : ""}`}><span>{dateTime(payment.voided_at || payment.paid_at)}</span><span><ReceiptText /><b>Orden {payment.service.slice(0, 8)}</b><small>{payment.note || "Sin nota"}</small></span><span><WalletCards /> {payment.method_name}</span><span>{payment.recorded_by_name}</span><strong>{currency(payment.amount)}{payment.voided_at && <small><RotateCcw /> Anulado</small>}</strong></div>)}</div>{!report.isPending && !report.data?.payments.length && <div className="empty-state"><Banknote /><h3>Sin movimientos</h3><p>No se registraron pagos en esta fecha.</p></div>}</section>
  </div>;
}
