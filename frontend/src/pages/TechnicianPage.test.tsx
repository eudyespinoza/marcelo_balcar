/* @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCompletionPayload, TechnicianCompletionForm } from "./TechnicianPage";

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
      onUpload={() => undefined}
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
