import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KpiCard } from "./DashboardPage";

describe("KpiCard", () => {
  it("marks long monetary values for responsive fitting without truncating them", () => {
    const value = "$ 12.345.678.901,00";
    const markup = renderToStaticMarkup(<KpiCard icon={() => <svg />} label="Total facturado" value={value} hint="Servicios con importe" money />);

    expect(markup).toContain("kpi-money");
    expect(markup).toContain("value-xl");
    expect(markup).toContain(value);
    expect(markup).toContain(`title="${value}"`);
  });
});
