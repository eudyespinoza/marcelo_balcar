import { describe, expect, it } from "vitest";
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from "./whatsapp";

describe("normalizeWhatsAppPhone", () => {
  it("converts a local Argentine mobile number to wa.me format", () => {
    expect(normalizeWhatsAppPhone("343 555-0101")).toBe("5493435550101");
  });

  it("removes the local 15 prefix", () => {
    expect(normalizeWhatsAppPhone("0343 15 555-0101")).toBe("5493435550101");
  });

  it("preserves an explicitly international non-Argentine number", () => {
    expect(normalizeWhatsAppPhone("+598 99 123 456")).toBe("59899123456");
  });

  it("rejects invalid phone numbers", () => {
    expect(normalizeWhatsAppPhone("123")).toBeNull();
  });
});

describe("buildWhatsAppUrl", () => {
  it("encodes the configured message", () => {
    expect(buildWhatsAppUrl("343 555-0101", "Hola, ¿cómo estás?")).toBe(
      "https://wa.me/5493435550101?text=Hola%2C%20%C2%BFc%C3%B3mo%20est%C3%A1s%3F",
    );
  });
});
