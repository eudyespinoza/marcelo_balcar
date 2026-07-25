/* @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentForm, ServicePhotoGallery } from "./ServicePanel";

describe("ServicePhotoGallery", () => {
  it("renders technician evidence as an authenticated image link", () => {
    const markup = renderToStaticMarkup(<ServicePhotoGallery photos={[{
      id: "photo-1",
      image_url: "/api/v1/service-photos/photo-1/file/",
      caption: "Trabajo terminado",
      captured_at: "2026-07-24T16:30:00Z"
    }]} />);

    expect(markup).toContain("Evidencia fotográfica");
    expect(markup).toContain('src="/api/v1/service-photos/photo-1/file/"');
    expect(markup).toContain('href="/api/v1/service-photos/photo-1/file/"');
    expect(markup).toContain("Trabajo terminado");
  });
});

describe("PaymentForm", () => {
  it("requires the service total before allowing a payment", () => {
    const markup = renderToStaticMarkup(<PaymentForm amountDue={null} balance={null} onEditTotal={() => undefined} onSubmit={() => undefined} disabled={false} />);

    expect(markup).toContain("Ingresá el importe total del servicio");
    expect(markup).toContain("Cargar importe total");
    expect(markup).not.toContain('name="amount"');
    expect(markup).not.toContain("Registrar cobro");
  });
});
