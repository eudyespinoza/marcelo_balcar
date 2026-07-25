/* @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ServicePhotoGallery } from "./ServicePanel";

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
