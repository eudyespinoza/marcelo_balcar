/* @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { clientFormPayload, clientListPath } from "./clients";

describe("clientListPath", () => {
  it("combines text, archive and delinquency filters", () => {
    expect(clientListPath("  Balcar  ", true, "true")).toBe("/clients/?q=Balcar&archived=only&is_delinquent=true");
  });

  it("omits the delinquency condition when all clients are selected", () => {
    expect(clientListPath("", false, "")).toBe("/clients/");
  });
});

describe("clientFormPayload", () => {
  it("sends a real boolean when the delinquency checkbox is selected", () => {
    const data = new FormData();
    data.set("name", "Cliente");
    data.set("is_delinquent", "on");

    expect(clientFormPayload(data)).toMatchObject({ name: "Cliente", is_delinquent: true });
  });

  it("explicitly clears delinquency when the checkbox is not selected", () => {
    const data = new FormData();
    data.set("name", "Cliente");

    expect(clientFormPayload(data)).toMatchObject({ name: "Cliente", is_delinquent: false });
  });
});
