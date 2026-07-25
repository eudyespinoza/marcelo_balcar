import { describe, expect, it } from "vitest";
import { argentinaDateKey, argentinaWallTimeToIso, currency, dateTime, dayOnly, inputDateTime, monthShort, timeOnly } from "./format";

describe("formatos argentinos", () => {
  it("muestra hora de Buenos Aires en 24 horas", () => {
    expect(dateTime("2026-01-01T03:30:00Z")).toContain("01/01/2026 00:30");
    expect(timeOnly("2026-01-01T18:05:00Z")).toBe("15:05");
  });

  it("muestra importes en pesos argentinos", () => {
    const rendered = currency("1234.50");
    expect(rendered).toContain("1.234,50");
    expect(rendered).toContain("$");
  });

  it("conserva el día argentino cuando UTC ya pasó a mañana", () => {
    const lateNight = new Date("2026-07-24T01:30:00Z");
    expect(argentinaDateKey(lateNight)).toBe("2026-07-23");
    expect(inputDateTime(lateNight.toISOString())).toBe("2026-07-23T22:30");
    expect(argentinaWallTimeToIso("2026-07-23T22:30")).toBe("2026-07-24T01:30:00.000Z");
    expect(dayOnly(lateNight.toISOString())).toBe("23");
    expect(monthShort(lateNight.toISOString())).toContain("jul");
  });
});
