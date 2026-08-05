/* @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCompletionPayload, clipboardItemsToImageFiles, TechnicianCompletionForm } from "./TechnicianPage";

describe("TechnicianCompletionForm", () => {
  it("shows the total and collected amounts before completing the service", () => {
    const markup = renderToStaticMarkup(<TechnicianCompletionForm
      notes="Trabajo terminado"
      amountDue=""
      collectedAmount=""
      disabled={false}
      onNotesChange={() => undefined}
      onAmountDueChange={() => undefined}
      onCollectedAmountChange={() => undefined}
      onFiles={() => undefined}
      onClipboardError={() => undefined}
      onSubmit={() => undefined}
    />);

    expect(markup).toContain("Importe total");
    expect(markup).toContain('name="amount_due"');
    expect(markup).toContain("Monto cobrado");
    expect(markup).toContain('name="collected_amount"');
    expect(markup.indexOf("Importe total")).toBeLessThan(markup.indexOf("Monto cobrado"));
    expect(markup.indexOf("Monto cobrado")).toBeLessThan(markup.indexOf("Finalizar servicio"));
    expect(markup.toLowerCase()).not.toContain("opcional");
  });

  it("offers camera, device gallery and clipboard as separate image sources", () => {
    const markup = renderToStaticMarkup(<TechnicianCompletionForm
      notes="Trabajo terminado"
      amountDue=""
      collectedAmount=""
      disabled={false}
      onNotesChange={() => undefined}
      onAmountDueChange={() => undefined}
      onCollectedAmountChange={() => undefined}
      onFiles={() => undefined}
      onClipboardError={() => undefined}
      onSubmit={() => undefined}
    />);

    expect(markup).toContain("Tomar foto");
    expect(markup).toContain("Elegir imágenes");
    expect(markup).toContain("Pegar imagen");
    expect(markup).toContain('multiple=""');
    expect(markup.match(/capture="environment"/g)).toHaveLength(1);
  });

  it("converts copied image blobs into uploadable files and ignores copied text", async () => {
    const files = await clipboardItemsToImageFiles([
      { types: ["text/plain", "image/png"], getType: async (type) => new Blob([type], { type }) },
      { types: ["text/plain"], getType: async (type) => new Blob([type], { type }) },
    ], 12345);

    expect(files).toHaveLength(1);
    expect(files[0]).toBeInstanceOf(File);
    expect(files[0].name).toBe("imagen-copiada-12345-1.png");
    expect(files[0].type).toBe("image/png");
  });

  it("omits empty amounts and sends the values entered", () => {
    expect(buildCompletionPayload(" Trabajo terminado. ", "", "")).toEqual({ notes: "Trabajo terminado." });
    expect(buildCompletionPayload("Trabajo terminado.", " 1000.00 ", " 350.50 ")).toEqual({
      notes: "Trabajo terminado.",
      amount_due: "1000.00",
      collected_amount: "350.50",
    });
    expect(buildCompletionPayload("Trabajo terminado.", " 1000.00 ", "")).toEqual({
      notes: "Trabajo terminado.",
      amount_due: "1000.00",
    });
  });
});
