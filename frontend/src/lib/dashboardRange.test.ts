import { describe, expect, it } from "vitest";
import { dashboardPresetRange } from "./dashboardRange";

describe("dashboardPresetRange", () => {
  it("builds inclusive week, month and year ranges", () => {
    expect(dashboardPresetRange("week", "2026-07-25")).toEqual({ start: "2026-07-19", end: "2026-07-25" });
    expect(dashboardPresetRange("month", "2026-07-25")).toEqual({ start: "2026-06-26", end: "2026-07-25" });
    expect(dashboardPresetRange("year", "2026-07-25")).toEqual({ start: "2025-07-26", end: "2026-07-25" });
  });
});
