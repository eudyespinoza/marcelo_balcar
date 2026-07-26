type MoneyTag = "b" | "span" | "strong";

export function moneyValueSize(value: string) {
  const digits = value.match(/\d/g)?.length ?? 0;
  if (digits >= 13) return "value-xl";
  if (digits >= 10) return "value-lg";
  if (digits >= 7) return "value-md";
  return "value-sm";
}

export function MoneyValue({ as: Tag = "span", value, className = "" }: { as?: MoneyTag; value: string; className?: string }) {
  return <Tag className={`money-value ${moneyValueSize(value)} ${className}`.trim()} title={value}>{value}</Tag>;
}
