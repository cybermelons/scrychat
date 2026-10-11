/**
 * Pure, testable half of the image-attach path: pick-list bookkeeping and the
 * File -> base64 encode. No DOM beyond the File/FileReader the browser hands
 * us, no React — ChatPanel owns the rendering and the <input type="file">.
 *
 * The limits here MIRROR apps/web/src/image-core.ts and are deliberately not
 * imported from it: ui/src may import from ../../src, but doing so would put a
 * server module in the browser bundle. The server re-validates every image it
 * receives, so this copy is a courtesy to the user (a local error instead of a
 * 400), never the boundary. If one side's limit changes, change both —
 * attach-core.test.ts asserts they agree.
 */

export const ATTACH_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export const ATTACH_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACH_MAX_COUNT = 4;

export interface PendingImage {
  /** Object URL for the thumbnail. The caller must revokeObjectURL it. */
  previewUrl: string;
  mediaType: string;
  base64: string;
  bytes: number;
  name: string;
}

export type AttachError =
  | "unsupported media type"
  | "too large"
  | "too many images"
  | "could not read file";

/** Why this File cannot be attached, or null if it can. */
export function checkFile(
  file: { type: string; size: number },
  alreadyAttached: number,
): AttachError | null {
  if (alreadyAttached >= ATTACH_MAX_COUNT) return "too many images";
  if (!(ATTACH_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return "unsupported media type";
  }
  if (file.size > ATTACH_MAX_BYTES) return "too large";
  return null;
}

/**
 * Strips the `data:<type>;base64,` prefix a FileReader data URL carries.
 * Returns null if the reader produced something other than a base64 data URL,
 * which is the one shape the POST body can carry.
 */
export function base64FromDataUrl(dataUrl: string): string | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  if (!dataUrl.slice(0, comma).includes(";base64")) return null;
  const b64 = dataUrl.slice(comma + 1);
  return b64.length > 0 ? b64 : null;
}

/** The `images` array the POST body carries: only the two fields the server reads. */
export function toRequestImages(
  pending: PendingImage[],
): { mediaType: string; base64: string }[] {
  return pending.map((p) => ({ mediaType: p.mediaType, base64: p.base64 }));
}
