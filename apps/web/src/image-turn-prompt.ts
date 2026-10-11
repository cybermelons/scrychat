import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ValidatedImage } from "./image-core.js";

/*
 * Its own module, not a function in server.ts, because the shape below is only
 * checked by a test (see the TYPE CAVEAT) and importing server.ts starts the
 * Express listener -- the suite then dies with EADDRINUSE on :8787.
 */

/**
 * One-message async iterable carrying the turn's text plus its image blocks.
 *
 * The image blocks come FIRST: the Messages API documents better results when
 * an image precedes the text that refers to it, and the text here ends with
 * the user's actual question about the photo.
 *
 * `session_id` is passed through rather than invented. It is "" for a brand-new
 * chat, which is what the SDK expects when there is nothing to resume.
 *
 * TYPE CAVEAT, measured 2026-10-11: `SDKUserMessage["message"]` is
 * `MessageParam` from `@anthropic-ai/sdk/resources`, and that package is NOT
 * installed -- the agent SDK declares the import but does not depend on it.
 * `skipLibCheck` in tsconfig.base.json swallows the resulting TS2307, so this
 * type silently degrades to `any` and the compiler checks NOTHING about the
 * block shape below. Do not trust a green typecheck here. The shape is instead
 * pinned by test/image-turn-prompt.test.ts, which asserts the emitted blocks
 * directly; keep that test in step with any change to this function.
 */
export async function* imageTurnPrompt(
  text: string,
  images: Pick<ValidatedImage, "mediaType" | "base64">[],
  sessionId: string,
): AsyncIterable<SDKUserMessage> {
  yield {
    type: "user",
    session_id: sessionId,
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: [
        ...images.map((img) => ({
          type: "image" as const,
          // No `as "image/png"` cast here: the field accepts any of the four
          // validated media types, and a cast naming one of them would assert
          // something false that the compiler cannot check anyway (see above).
          source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
        })),
        { type: "text" as const, text },
      ],
    },
  };
}
