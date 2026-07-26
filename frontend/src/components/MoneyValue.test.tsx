import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MoneyValue, moneyValueSize } from "./MoneyValue";

describe("MoneyValue", () => {
  it("classifies eleven-digit amounts for the smallest responsive treatment", () => {
    const value = "$ 12.345.678.901,00";

    expect(moneyValueSize(value)).toBe("value-xl");
    expect(renderToStaticMarkup(<MoneyValue as="strong" value={value} />)).toContain(`title="${value}"`);
    expect(renderToStaticMarkup(<MoneyValue as="strong" value={value} />)).toContain("value-xl");
  });

  it("keeps short values at their normal display size", () => {
    expect(moneyValueSize("$ 0,00")).toBe("value-sm");
  });
});
