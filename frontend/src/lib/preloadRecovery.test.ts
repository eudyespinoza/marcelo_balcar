/* @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { recoverFromPreloadError } from "./preloadRecovery";

describe("recoverFromPreloadError", () => {
  it("reloads once when a deployed lazy chunk is no longer available", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const reload = vi.fn();
    const firstError = new Event("vite:preloadError", { cancelable: true });
    const repeatedError = new Event("vite:preloadError", { cancelable: true });

    expect(recoverFromPreloadError(firstError, storage, reload, 1_000)).toBe(true);
    expect(firstError.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();

    expect(recoverFromPreloadError(repeatedError, storage, reload, 2_000)).toBe(false);
    expect(repeatedError.defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });
});
