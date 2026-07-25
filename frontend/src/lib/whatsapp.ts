function validWhatsAppPhone(value: string) {
  return value.length >= 8 && value.length <= 15 ? value : null;
}

export function normalizeWhatsAppPhone(phone: string) {
  const raw = phone.trim();
  const explicitInternational = raw.startsWith("+") || raw.startsWith("00");
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("00")) digits = digits.slice(2);

  if (digits.startsWith("54")) {
    let national = digits.slice(2).replace(/^0/, "");
    if (national.startsWith("9")) return validWhatsAppPhone(`54${national}`);
    national = national.replace(/^(\d{2,4})15(?=\d{6,8}$)/, "$1");
    return validWhatsAppPhone(`549${national}`);
  }

  if (explicitInternational) return validWhatsAppPhone(digits);

  const national = digits
    .replace(/^0/, "")
    .replace(/^(\d{2,4})15(?=\d{6,8}$)/, "$1");
  return validWhatsAppPhone(`549${national}`);
}

export function buildWhatsAppUrl(phone: string, message: string) {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  if (!normalizedPhone) return null;
  const text = message.trim();
  return `https://wa.me/${normalizedPhone}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
