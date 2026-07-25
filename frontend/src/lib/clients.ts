export type DelinquencyFilter = "" | "true" | "false";

export function clientListPath(search: string, archived: boolean, delinquency: DelinquencyFilter) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("q", search.trim());
  if (archived) params.set("archived", "only");
  if (delinquency) params.set("is_delinquent", delinquency);
  const query = params.toString();
  return `/clients/${query ? `?${query}` : ""}`;
}

export function clientFormPayload(data: FormData): Record<string, unknown> {
  return {
    ...Object.fromEntries(data.entries()),
    is_delinquent: data.has("is_delinquent")
  };
}
