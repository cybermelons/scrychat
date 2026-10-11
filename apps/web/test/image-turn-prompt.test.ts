import { describe, expect, it } from "vitest";
import type { ImageMediaType } from "../src/image-core.js";
import { imageTurnPrompt } from "../src/image-turn-prompt.js";

/**
 * These assertions are the ONLY check on the image content-block shape.
 *
 * `SDKUserMessage["message"]` is `MessageParam` from `@anthropic-ai/sdk/
 * resources`, which is not installed; `skipLibCheck` hides the TS2307 and the
 * type degrades to `any`. So `pnpm typecheck` passing says nothing about these
 * fields -- a typo in `media_type`, a wrong `type`, or blocks in the wrong
 * order would all compile. Hence explicit assertions on the emitted object.
 */
const drain = async (it: AsyncIterable<unknown>) => {
  const out: unknown[] = [];
  for await (const m of it) out.push(m);
  return out;
};

const IMG = { mediaType: "image/png" as ImageMediaType, base64: "aGk=" };

describe("imageTurnPrompt", () => {
  it("yields exactly one user message", async () => {
    const msgs = await drain(imageTurnPrompt("what is this?", [IMG], "sess-1"));
    expect(msgs).toHaveLength(1);
    const m = msgs[0] as Record<string, unknown>;
    expect(m.type).toBe("user");
    expect(m.session_id).toBe("sess-1");
    expect(m.parent_tool_use_id).toBeNull();
  });

  it("emits the image block with the exact field names the API expects", async () => {
    const [m] = (await drain(imageTurnPrompt("q", [IMG], ""))) as any[];
    const content = m.message.content;
    expect(m.message.role).toBe("user");
    expect(content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "aGk=" },
    });
  });

  it("puts images BEFORE the text block", async () => {
    const [m] = (await drain(imageTurnPrompt("describe it", [IMG], ""))) as any[];
    const kinds = m.message.content.map((b: { type: string }) => b.type);
    expect(kinds).toEqual(["image", "text"]);
    expect(m.message.content[1]).toEqual({ type: "text", text: "describe it" });
  });

  it("preserves the order and media type of several images", async () => {
    const imgs: { mediaType: ImageMediaType; base64: string }[] = [
      { mediaType: "image/png", base64: "aaa=" },
      { mediaType: "image/jpeg", base64: "bbb=" },
      { mediaType: "image/webp", base64: "ccc=" },
    ];
    const [m] = (await drain(imageTurnPrompt("t", imgs, ""))) as any[];
    expect(m.message.content.map((b: any) => b.type)).toEqual(["image", "image", "image", "text"]);
    expect(m.message.content.slice(0, 3).map((b: any) => b.source.media_type)).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
    expect(m.message.content.slice(0, 3).map((b: any) => b.source.data)).toEqual(["aaa=", "bbb=", "ccc="]);
  });

  it("passes the prompt text through unchanged, including the UI context line", async () => {
    const text = "[UI context: deck \"X\"]\n\nwhat is this card?";
    const [m] = (await drain(imageTurnPrompt(text, [IMG], ""))) as any[];
    expect(m.message.content[1].text).toBe(text);
  });
});
