import { describe, it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type Handler = (args: any) => Promise<{ content: { text: string }[] }>;

describe("deck_present contract refusal", () => {
  it("refuses with violations and no slides, then renders once deck_set_meta clears the contract", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "scrychat-present-"));
    await fs.mkdir(path.join(dir, "decks"));
    // An empty deck: no card needs resolving (no network), every default quota is missed.
    await fs.writeFile(
      path.join(dir, "decks", "empty.json"),
      JSON.stringify({ name: "empty", commander: "X", commanderIdentity: [], cards: [], updatedAt: "" }),
    );
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const { registerTools } = await import("../src/tools.js");
    const handlers: Record<string, Handler> = {};
    registerTools({ registerTool: (n: string, _c: unknown, h: Handler) => void (handlers[n] = h) } as any);
    const call = async (n: string, a: object) => JSON.parse((await handlers[n](a)).content[0].text);

    const refused = await call("deck_present", { deck_name: "empty" });
    expect(refused.error).toBe("contract not met");
    expect(refused.violations.length).toBeGreaterThan(0);
    expect(refused.slides).toBeUndefined();

    const zero = [0, 0];
    await call("deck_set_meta", {
      deck_name: "empty",
      quota_targets: { lands: zero, ramp: zero, draw: zero, interaction: zero, wipes: zero, wincon: zero },
    });
    const ok = await call("deck_present", { deck_name: "empty" });
    expect(ok.kind).toBe("slides");
    expect(ok.slides.length).toBeGreaterThan(0);
  });
});
