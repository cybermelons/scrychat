import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_IMAGES_PER_TURN,
  MAX_IMAGE_BYTES,
  sniffMediaType,
  validateImage,
  validateImages,
} from "../src/image-core.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2]);
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1]);
const b64 = (b: Buffer) => b.toString("base64");

describe("sniffMediaType", () => {
  it("recognises each supported signature", () => {
    expect(sniffMediaType(PNG)).toBe("image/png");
    expect(sniffMediaType(JPEG)).toBe("image/jpeg");
    expect(sniffMediaType(GIF)).toBe("image/gif");
    expect(sniffMediaType(WEBP)).toBe("image/webp");
  });

  it("returns null for unrecognised and truncated input", () => {
    expect(sniffMediaType(Buffer.from("not an image"))).toBeNull();
    expect(sniffMediaType(Buffer.from([]))).toBeNull();
    // A truncated PNG signature must not pass on a short read.
    expect(sniffMediaType(Buffer.from([0x89, 0x50, 0x4e]))).toBeNull();
    // RIFF without WEBP is some other RIFF container (e.g. wav).
    expect(sniffMediaType(Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
  });

  it("rejects GIF with a bad version byte", () => {
    expect(sniffMediaType(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x35, 0x61]))).toBeNull();
  });
});

describe("validateImage", () => {
  it("accepts a well-formed png and reports its decoded size", () => {
    const r = validateImage({ mediaType: "image/png", base64: b64(PNG) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.image.mediaType).toBe("image/png");
      expect(r.image.bytes).toBe(PNG.length);
      expect(r.image.base64).toBe(b64(PNG));
    }
  });

  it("strips a data-URL prefix", () => {
    const r = validateImage({ mediaType: "image/png", base64: `data:image/png;base64,${b64(PNG)}` });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.image.base64).toBe(b64(PNG));
  });

  // The load-bearing check: the client declares the type, the bytes decide.
  it("rejects a declared type that disagrees with the bytes", () => {
    const r = validateImage({ mediaType: "image/png", base64: b64(JPEG) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("declared type does not match bytes");
  });

  it("rejects bytes that are not an image at all", () => {
    const r = validateImage({ mediaType: "image/png", base64: b64(Buffer.from("<svg onload=x>")) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("declared type does not match bytes");
  });

  it("rejects an unsupported media type even with valid bytes", () => {
    const r = validateImage({ mediaType: "image/svg+xml", base64: b64(PNG) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("unsupported media type");
  });

  it("rejects a non-object, a missing base64 and an empty payload", () => {
    expect(validateImage(null).ok).toBe(false);
    expect(validateImage("x").ok).toBe(false);
    expect(validateImage({ mediaType: "image/png" }).ok).toBe(false);
    expect(validateImage({ mediaType: "image/png", base64: "" }).ok).toBe(false);
  });

  it("rejects non-base64 characters", () => {
    const r = validateImage({ mediaType: "image/png", base64: "!!!!not base64!!!!" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("bad base64");
  });

  // Boundary hardcoded at 5 MiB, not read from MAX_IMAGE_BYTES: a test written
  // with the constant it guards moves with a defect and can never fail.
  it("accepts an image at 5 MiB and rejects one past it", () => {
    const atCap = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(5 * 1024 * 1024 - 8, 7)]);
    expect(atCap.length).toBe(5 * 1024 * 1024);
    expect(validateImage({ mediaType: "image/png", base64: b64(atCap) }).ok).toBe(true);

    const overCap = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(5 * 1024 * 1024 - 7, 7)]);
    expect(overCap.length).toBe(5 * 1024 * 1024 + 1);
    const r = validateImage({ mediaType: "image/png", base64: b64(overCap) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("too large");
  });
});

describe("validateImages", () => {
  it("treats an absent field as a text-only turn, not an error", () => {
    expect(validateImages(undefined)).toEqual({ ok: true, images: [] });
    expect(validateImages(null)).toEqual({ ok: true, images: [] });
    expect(validateImages([])).toEqual({ ok: true, images: [] });
  });

  it("accepts several images and preserves order", () => {
    const r = validateImages([
      { mediaType: "image/png", base64: b64(PNG) },
      { mediaType: "image/jpeg", base64: b64(JPEG) },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.images.map((i) => i.mediaType)).toEqual(["image/png", "image/jpeg"]);
  });

  it("reports which image failed", () => {
    const r = validateImages([
      { mediaType: "image/png", base64: b64(PNG) },
      { mediaType: "image/png", base64: b64(JPEG) },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.index).toBe(1);
      expect(r.error).toBe("declared type does not match bytes");
    }
  });

  // Boundary hardcoded at 4, not MAX_IMAGES_PER_TURN.
  it("accepts 4 images and rejects 5", () => {
    const one = { mediaType: "image/png", base64: b64(PNG) };
    expect(validateImages(Array(4).fill(one)).ok).toBe(true);
    const r = validateImages(Array(5).fill(one));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("too many images");
  });

  it("rejects a non-array", () => {
    expect(validateImages({ mediaType: "image/png" }).ok).toBe(false);
  });
});

describe("the express body limit must exceed the image budget", () => {
  /**
   * Measured 2026-10-11: with express.json()'s 100kb default, a single 200kb
   * photo 413s in the body parser BEFORE validateImages runs, so every
   * per-image error message above is unreachable and the feature is broken for
   * essentially any real image. No unit test of image-core can catch that --
   * the limit lives in server.ts. This asserts the two agree.
   */
  it("parses a limit from server.ts larger than the worst legitimate body", () => {
    const src = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
    const m = src.match(/express\.json\(\{\s*limit:\s*"(\d+)mb"\s*\}\)/);
    expect(m, "server.ts must call express.json({ limit: \"<N>mb\" })").not.toBeNull();
    const limitBytes = Number(m![1]) * 1024 * 1024;
    // base64 costs 4 bytes per 3, plus JSON overhead.
    const worstBody = Math.ceil((MAX_IMAGE_BYTES * MAX_IMAGES_PER_TURN * 4) / 3);
    expect(limitBytes).toBeGreaterThan(worstBody);
  });
});
