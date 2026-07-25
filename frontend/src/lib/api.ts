const API_ROOT = "/api/v1";

function cookie(name: string) {
  return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.split("=").slice(1).join("=") ?? "";
}

export class ApiError extends Error {
  constructor(public status: number, public data: unknown, message: string) {
    super(message);
  }
}

function firstValidationMessage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) { const message = firstValidationMessage(item); if (message) return message; }
  }
  if (typeof value === "object" && value) {
    for (const item of Object.values(value)) { const message = firstValidationMessage(item); if (message) return message; }
  }
  return null;
}

export function apiErrorMessage(data: unknown, fallback = "No se pudo completar la operación.") {
  if (typeof data === "object" && data && "overlap" in data) return "El técnico ya tiene un servicio en ese horario.";
  if (typeof data === "object" && data && "detail" in data) return firstValidationMessage((data as { detail: unknown }).detail) ?? fallback;
  return firstValidationMessage(data) ?? fallback;
}

export async function ensureCsrf() {
  if (!cookie("csrftoken")) await fetch(`${API_ROOT}/auth/csrf/`, { credentials: "include" });
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const isForm = options.body instanceof FormData;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) await ensureCsrf();
  const headers = new Headers(options.headers);
  if (!isForm && options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const csrf = cookie("csrftoken");
  if (csrf && !["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("X-CSRFToken", decodeURIComponent(csrf));
  const response = await fetch(`${API_ROOT}${path}`, { ...options, headers, credentials: "include" });
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("json") ? await response.json() : await response.text();
  if (!response.ok) {
    const detail = apiErrorMessage(data);
    throw new ApiError(response.status, data, detail);
  }
  return data as T;
}

export const jsonBody = (value: unknown): RequestInit => ({ body: JSON.stringify(value) });

export function resultList<T>(value: T[] | { results: T[] }) {
  return Array.isArray(value) ? value : value.results;
}
