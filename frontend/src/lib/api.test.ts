import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "./api";

describe("apiErrorMessage", () => {
  it("shows nested backend validation messages", () => {
    expect(apiErrorMessage({ detail: { service: ["El servicio debe tener un importe total antes de cobrar."] } }))
      .toBe("El servicio debe tener un importe total antes de cobrar.");
  });
});
