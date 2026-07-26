import { MoneyValue } from "./MoneyValue";

export interface TrendDatum {
  label: string;
  values: Record<string, number>;
}

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  format?: (value: number) => string;
}

export function linePoints(data: TrendDatum[], key: string, width: number, height: number, maximum: number) {
  const safeMaximum = Math.max(maximum, 1);
  return data.map((item, index) => {
    const x = data.length <= 1 ? width / 2 : index / (data.length - 1) * width;
    const y = height - Math.max(item.values[key] ?? 0, 0) / safeMaximum * height;
    return { x, y, value: item.values[key] ?? 0, label: item.label };
  });
}

export function compactAxisNumber(value: number) {
  const absolute = Math.abs(value);
  const divisor = absolute >= 1_000_000_000 ? 1_000_000_000 : absolute >= 1_000_000 ? 1_000_000 : absolute >= 1000 ? 1000 : 1;
  const suffix = divisor === 1_000_000_000 ? " B" : divisor === 1_000_000 ? " M" : divisor === 1000 ? " k" : "";
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: divisor === 1 ? 0 : 1 }).format(value / divisor)}${suffix}`;
}

export function TrendChart({ data, series, ariaLabel }: { data: TrendDatum[]; series: TrendSeries[]; ariaLabel: string }) {
  const width = 760;
  const height = 220;
  const chart = { left: 42, top: 12, width: width - 58, height: height - 48 };
  const maximum = Math.max(1, ...data.flatMap((item) => series.map((itemSeries) => item.values[itemSeries.key] ?? 0)));
  const labelStep = Math.max(Math.ceil(data.length / 6), 1);
  return <div className="trend-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
      {[0, 1, 2, 3, 4].map((tick) => {
        const y = chart.top + chart.height - tick / 4 * chart.height;
        return <g key={tick}><line className="chart-gridline" x1={chart.left} x2={chart.left + chart.width} y1={y} y2={y} /><text className="chart-axis-label" x={chart.left - 9} y={y + 4} textAnchor="end">{compactAxisNumber(maximum * tick / 4)}</text></g>;
      })}
      {data.map((item, index) => {
        if (index % labelStep && index !== data.length - 1) return null;
        const x = chart.left + (data.length <= 1 ? chart.width / 2 : index / (data.length - 1) * chart.width);
        return <text className="chart-axis-label" key={item.label} x={x} y={height - 8} textAnchor="middle">{item.label}</text>;
      })}
      {series.map((itemSeries) => {
        const points = linePoints(data, itemSeries.key, chart.width, chart.height, maximum);
        const path = points.map((point, index) => `${index ? "L" : "M"}${chart.left + point.x},${chart.top + point.y}`).join(" ");
        return <g key={itemSeries.key}>
          <path className="chart-line" d={path} stroke={itemSeries.color} strokeDasharray={itemSeries.dashed ? "7 5" : undefined} />
          {points.map((point) => <circle key={`${itemSeries.key}-${point.label}`} className="chart-point" cx={chart.left + point.x} cy={chart.top + point.y} r="3.5" fill={itemSeries.color}><title>{`${point.label}: ${itemSeries.label} ${itemSeries.format?.(point.value) ?? point.value}`}</title></circle>)}
        </g>;
      })}
    </svg>
    <div className="chart-legend">{series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>
    <details className="chart-data"><summary>Ver datos exactos</summary><div><table><thead><tr><th>Período</th>{series.map((item) => <th key={item.key}>{item.label}</th>)}</tr></thead><tbody>{data.map((item) => <tr key={item.label}><td>{item.label}</td>{series.map((itemSeries) => <td key={itemSeries.key}>{itemSeries.format?.(item.values[itemSeries.key] ?? 0) ?? item.values[itemSeries.key] ?? 0}</td>)}</tr>)}</tbody></table></div></details>
  </div>;
}

export interface BarDatum {
  label: string;
  value: number;
  displayValue?: string;
  meta?: string;
  color?: string;
}

export function BarRanking({ data, ariaLabel }: { data: BarDatum[]; ariaLabel: string }) {
  const maximum = Math.max(1, ...data.map((item) => item.value));
  if (!data.length) return <p className="chart-empty">Todavía no hay datos suficientes.</p>;
  return <div className="bar-ranking" role="img" aria-label={ariaLabel}>{data.map((item) => <div className={`dashboard-bar-row${item.displayValue ? " has-display-value" : ""}`} key={item.label}>
    <div><strong>{item.label}</strong>{item.meta && <small>{item.meta}</small>}</div>
    <div className="dashboard-bar-track"><i style={{ width: `${item.value / maximum * 100}%`, background: item.color }} /></div>
    {item.displayValue ? <MoneyValue as="b" value={item.displayValue} /> : <b>{item.value}</b>}
  </div>)}</div>;
}
