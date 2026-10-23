import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type Handler = (args: any) => Promise<{ content: { text: string }[] }>;

async function mkUser(name: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `scrychat-root-${name}-`));
  await fs.mkdir(path.join(dir, "decks"));
  await fs.writeFile(
    path.join(dir, "decks", `${name}.json`),
    JSON.stringify({ name, commander: "X", commanderIdentity: [], cards: [], updatedAt: "" }),
  );
  return dir;
}

async function load(root: string | undefined) {
  vi.resetModules();
  if (root === undefined) delete process.env.SCRYCHAT_ROOT;
  else process.env.SCRYCHAT_ROOT = root;
  const mod = await import("../src/tools.js");
  const handlers: Record<string, Handler> = {};
  mod.registerTools({ registerTool: (n: string, _c: unknown, h: Handler) => void (handlers[n] = h) } as any);
  const call = async (n: string, a: object = {}) => JSON.parse((await handlers[n](a)).content[0].text);
  return { mod, call };
}

afterEach(() => {
  delete process.env.SCRYCHAT_ROOT;
  vi.restoreAllMocks();
});

describe("SCRYCHAT_ROOT scoping", () => {
  it("all path constants resolve under the root", async () => {
    const a = await mkUser("alice");
    const { mod } = await load(a);
    for (const p of [mod.decksDir, mod.suggestionsDir, mod.collectionPath, mod.configPath]) {
      expect(p.startsWith(a + path.sep)).toBe(true);
    }
  });

  it("deck_list shows only the root's decks", async () => {
    const a = await mkUser("alice");
    const b = await mkUser("bob");
    const asA = await load(a);
    expect(JSON.stringify(await asA.call("deck_list"))).toContain("alice");
    expect(JSON.stringify(await asA.call("deck_list"))).not.toContain("bob");
    const asB = await load(b);
    expect(JSON.stringify(await asB.call("deck_list"))).toContain("bob");
    expect(JSON.stringify(await asB.call("deck_list"))).not.toContain("alice");
  });

  it("falls back to cwd when SCRYCHAT_ROOT is unset (terminal session)", async () => {
    const a = await mkUser("carol");
    vi.spyOn(process, "cwd").mockReturnValue(a);
    const { mod } = await load(undefined);
    expect(mod.ROOT).toBe(a);
  });
});
