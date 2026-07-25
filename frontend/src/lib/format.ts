import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export const TZ = "America/Argentina/Buenos_Aires";

export function dateTime(value?: string | null) {
  if (!value) return "Sin registrar";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(new Date(value)).replace(",", "");
}

export function timeOnly(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function dayOnly(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ, day: "2-digit" }).format(new Date(value));
}

export function monthShort(value?: string | null) {
  if (!value) return "s/f";
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ, month: "short" }).format(new Date(value));
}

export function currency(value?: string | number | null) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

export function relative(value: string) {
  return formatDistanceToNowStrict(parseISO(value), { addSuffix: true, locale: es });
}

export function inputDateTime(value?: string | null) {
  if (!value) return "";
  const parts = argentinaParts(new Date(value), true);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function argentinaDateKey(value: Date = new Date()) {
  const parts = argentinaParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function argentinaWallTimeToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Fecha y hora inválidas.");
  const [, year, month, day, hour, minute] = match;
  const desiredUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let candidate = new Date(desiredUtc);
  for (let pass = 0; pass < 2; pass += 1) {
    const shown = argentinaParts(candidate, true);
    const shownAsUtc = Date.UTC(Number(shown.year), Number(shown.month) - 1, Number(shown.day), Number(shown.hour), Number(shown.minute));
    candidate = new Date(desiredUtc - (shownAsUtc - candidate.getTime()));
  }
  return candidate.toISOString();
}

export function localIso(date: Date) {
  return date.toISOString();
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function argentinaParts(value: Date, withTime = false) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {})
  });
  return Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value])) as Record<string, string>;
}
