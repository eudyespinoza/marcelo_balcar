import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { currency, initials } from "../lib/format";
import type { DashboardAccount } from "../types";
import { Modal } from "./Modal";
import { MoneyValue } from "./MoneyValue";

export type DashboardAccountMode = "delinquent" | "outstanding";

export function DashboardAccountsDialog({ mode, accounts, total, onClose }: {
  mode: DashboardAccountMode;
  accounts: DashboardAccount[];
  total: string | null;
  onClose: () => void;
}) {
  const delinquent = mode === "delinquent";
  const title = delinquent ? "Clientes en mora" : "Saldos pendientes";
  const countLabel = accounts.length === 1 ? "cuenta" : "cuentas";

  return <Modal title={title} onClose={onClose} wide>
    <div className="dashboard-accounts-dialog" id={`dashboard-${mode}-accounts`}>
      <div className="dashboard-accounts-summary">
        <div><strong>{accounts.length}</strong><span>{countLabel}</span></div>
        {total !== null && <div><small>Saldo total</small><MoneyValue as="strong" value={currency(total)} /></div>}
      </div>

      <DashboardAccountList accounts={accounts} label={title} onSelect={onClose} />
    </div>
  </Modal>;
}

export function DashboardAccountList({ accounts, label, onSelect }: { accounts: DashboardAccount[]; label: string; onSelect?: () => void }) {
  return accounts.length ? <nav className="dashboard-account-list" aria-label={label}>
        {accounts.map((account) => <Link to={`/clientes/${account.id}`} key={account.id} onClick={onSelect}>
          <span className="dashboard-account-initial">{initials(account.name) || "C"}</span>
          <span className="dashboard-account-name"><strong>{account.name}</strong><small>{account.is_delinquent ? "Cliente en mora" : "Saldo pendiente"}</small></span>
          {account.outstanding_balance !== null && <MoneyValue as="strong" value={currency(account.outstanding_balance)} className="dashboard-account-balance" />}
          <ChevronRight aria-hidden="true" />
        </Link>)}
      </nav> : <div className="dashboard-accounts-empty"><strong>Sin cuentas para mostrar</strong><p>No hay clientes en esta situación.</p></div>;
}
