/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.querySelectorAll(".modal-backdrop").forEach((element) => element.remove());
  });

  it("renders the backdrop under body instead of the transformed page container", () => {
    act(() => {
      root.render(
        <main style={{ marginLeft: 258, transform: "translateY(0)" }}>
          <Modal title="Detalle del servicio" onClose={() => undefined}>Contenido</Modal>
        </main>
      );
    });

    const backdrop = document.querySelector(".modal-backdrop");
    expect(backdrop).not.toBeNull();
    expect(backdrop?.parentElement).toBe(document.body);
    expect(host.querySelector(".modal-backdrop")).toBeNull();
  });
});
