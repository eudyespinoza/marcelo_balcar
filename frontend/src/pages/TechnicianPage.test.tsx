/* @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCompletionPayload, TechnicianCompletionForm } from "./TechnicianPage";

describe("TechnicianCompletionForm", () => {
  it("shows the collected amount before completing the service", () => {
    const markup = renderToStaticMarkup(<TechnicianCompletionForm
      notes="Trabajo terminado"
      collectedAmount=""
      disabled={false}
      onNotesChange={() => undefined}
      onCollectedAmountChange={() => undefined}
      onUpload={() => undefined}
      onSubmit={() => undefined}
    />);

    expect(markup).toContain("Monto cobrado");
    expect(markup).toContain('name="collected_amount"');
    expect(markup.indexOf("Monto cobrado")).toBeLessThan(markup.indexOf("Finalizar servicio"));
    expect(markup.toLowerCase()).not.toContain("opcional");
  });

  it("omits an empty amount and sends an entered amount", () => {
    expect(buildCompletionPayload(" Trabajo terminado. ", "")).toEqual({ notes: "Trabajo terminado." });
    expect(buildCompletionPayload("Trabajo terminado.", " 350.50 ")).toEqual({
      notes: "Trabajo terminado.",
      collected_amount: "350.50",
    });
  });
});
