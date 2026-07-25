import { MessageCircle } from "lucide-react";
import { buildWhatsAppUrl } from "../lib/whatsapp";

export function WhatsAppLink({ phone, message, clientName, compact = false }: { phone: string; message: string; clientName: string; compact?: boolean }) {
  const href = buildWhatsAppUrl(phone, message);
  if (!href) return null;

  return <a
    className={`whatsapp-link${compact ? " compact" : ""}`}
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={`Enviar WhatsApp a ${clientName}`}
    onClick={(event) => event.stopPropagation()}
  >
    <MessageCircle />
    <span>WhatsApp</span>
  </a>;
}
