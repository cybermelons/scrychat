import { describe, it, expect, vi, afterEach } from "vitest";
import { stub } from "../ui/src/stub.js";

afterEach(() => vi.unstubAllGlobals());

describe("stub click handler", () => {
  it("logs [stub] and inserts a visible error span after the clicked element", () => {
    const span: { className: string; textContent: string; remove: () => void } = {
      className: "",
      textContent: "",
      remove: () => void 0,
    };
    vi.stubGlobal("document", {
      querySelectorAll: () => [],
      createElement: () => span,
      addEventListener: () => void 0,
      removeEventListener: () => void 0,
    });
    const inserted: unknown[] = [];
    const el = { insertAdjacentElement: (pos: string, n: unknown) => inserted.push([pos, n]) };
    const err = vi.spyOn(console, "error").mockImplementation(() => void 0);
    stub("X")({ currentTarget: el as unknown as Element });
    expect(err).toHaveBeenCalledWith("[stub] X: not implemented");
    expect(inserted).toEqual([["afterend", span]]);
    expect(span.className).toBe("sc-chip sc-chip-error stub-error");
    expect(span.textContent).toBe("X: not built yet");
    err.mockRestore();
  });
});
