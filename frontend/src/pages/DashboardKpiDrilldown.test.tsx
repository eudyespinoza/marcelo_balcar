import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KpiCard } from "./DashboardPage";

describe("KpiCard drill-down", () => {
  it("uses an accessible dialog trigger when the indicator has account detail", () => {
    const markup = renderToStaticMarkup(<KpiCard
      icon={() => <svg />}
      label="Clientes en mora"
      value="6"
      hint="1.0% de la cartera"
      actionLabel="Ver cuentas"
      controls="dashboard-delinquent-accounts"
      expanded
      onClick={() => undefined}
    />);

    expect(markup.startsWith("<button")).toBe(true);
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-controls="dashboard-delinquent-accounts"');
    expect(markup).toContain("Ver cuentas");
  });
});
