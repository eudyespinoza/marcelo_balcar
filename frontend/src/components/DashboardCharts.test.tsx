import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BarRanking, compactAxisNumber, linePoints, TrendChart } from "./DashboardCharts";

describe("DashboardCharts", () => {
  it("scales line points inside the chart bounds", () => {
    const points = linePoints([
      { label: "día 1", values: { total: 0 } },
      { label: "día 2", values: { total: 10 } },
    ], "total", 100, 50, 10);

    expect(points).toEqual([
      { x: 0, y: 50, value: 0, label: "día 1" },
      { x: 100, y: 0, value: 10, label: "día 2" },
    ]);
  });

  it("includes an accessible text table alongside the chart", () => {
    const markup = renderToStaticMarkup(<TrendChart
      ariaLabel="Servicios diarios"
      data={[{ label: "24 jul", values: { total: 3 } }]}
      series={[{ key: "total", label: "Programados", color: "#245f89" }]}
    />);

    expect(markup).toContain('aria-label="Servicios diarios"');
    expect(markup).toContain("Ver datos exactos");
    expect(markup).toContain("Programados");
  });

  it("keeps long monetary ranking values complete and marks their responsive row", () => {
    const value = "$ 12.345.678.901,00";
    const markup = renderToStaticMarkup(<BarRanking ariaLabel="Cobros" data={[{ label: "Efectivo", value: 12345678901, displayValue: value }]} />);

    expect(markup).toContain("has-display-value");
    expect(markup).toContain("value-xl");
    expect(markup).toContain(value);
  });

  it("uses compact axis labels for values that would not fit in the chart gutter", () => {
    expect(compactAxisNumber(150200)).toMatch(/150[,.]2/);
    expect(compactAxisNumber(150200).length).toBeLessThan(10);
  });
});
