import { describe, expect, it } from "vitest";
import {
  ATTACH_ALLOWED_TYPES,
  ATTACH_MAX_BYTES,
  ATTACH_MAX_COUNT,
  base64FromDataUrl,
  checkFile,
  toRequestImages,
  type PendingImage,
} from "../ui/src/attach-core.js";
import {
  ALLOWED_MEDIA_TYPES,
  MAX_IMAGES_PER_TURN,
  MAX_IMAGE_BYTES,
} from "../src/image-core.js";

describe("attach limits mirror the server's", () => {
  // attach-core duplicates these rather than importing a server module into
  // the browser bundle. Nothing but this test stops the two from drifting,
  // and drift is silent: the client would accept a file the server rejects
  // with a bare 400.
  it("agrees with image-core on every limit", () => {
    expect([...ATTACH_ALLOWED_TYPES]).toEqual([...ALLOWED_MEDIA_TYPES]);
    expect(ATTACH_MAX_BYTES).toBe(MAX_IMAGE_BYTES);
    expect(ATTACH_MAX_COUNT).toBe(MAX_IMAGES_PER_TURN);
  });
});

describe("checkFile", () => {
  it("accepts each supported type at the exact byte limit", () => {
    for (const type of ATTACH_ALLOWED_TYPES) {
      expect(checkFile({ type, size: 5 * 1024 * 1024 }, 0)).toBeNull();
    }
  });

  it("rejects one byte over the limit", () => {
    expect(checkFile({ type: "image/png", size: 5 * 1024 * 1024 + 1 }, 0)).toBe("too large");
  });

  it("rejects an unsupported type", () => {
    expect(checkFile({ type: "image/svg+xml", size: 10 }, 0)).toBe("unsupported media type");
    expect(checkFile({ type: "application/pdf", size: 10 }, 0)).toBe("unsupported media type");
    expect(checkFile({ type: "", size: 10 }, 0)).toBe("unsupported media type");
  });

  it("accepts the 4th image and rejects the 5th", () => {
    expect(checkFile({ type: "image/png", size: 10 }, 3)).toBeNull();
    expect(checkFile({ type: "image/png", size: 10 }, 4)).toBe("too many images");
  });

  it("reports the count limit before the type, so a 5th bad file names the real blocker", () => {
    expect(checkFile({ type: "application/pdf", size: 10 }, 4)).toBe("too many images");
  });
});

describe("base64FromDataUrl", () => {
  it("strips the prefix a FileReader produces", () => {
    expect(base64FromDataUrl("data:image/png;base64,aGk=")).toBe("aGk=");
  });

  it("returns null for a non-base64 data URL", () => {
    expect(base64FromDataUrl("data:image/svg+xml,%3Csvg%2F%3E")).toBeNull();
  });

  it("returns null when there is no comma at all", () => {
    expect(base64FromDataUrl("not-a-data-url")).toBeNull();
  });

  it("returns null for an empty payload", () => {
    expect(base64FromDataUrl("data:image/png;base64,")).toBeNull();
  });
});

describe("toRequestImages", () => {
  it("sends only mediaType and base64, dropping the preview URL and name", () => {
    const pending: PendingImage[] = [
      {
        previewUrl: "blob:http://x/1",
        mediaType: "image/png",
        base64: "aaa=",
        bytes: 3,
        name: "card.png",
      },
    ];
    expect(toRequestImages(pending)).toEqual([{ mediaType: "image/png", base64: "aaa=" }]);
  });

  it("preserves order", () => {
    const mk = (n: string, b: string): PendingImage => ({
      previewUrl: "blob:x",
      mediaType: "image/png",
      base64: b,
      bytes: 1,
      name: n,
    });
    expect(toRequestImages([mk("a", "1="), mk("b", "2="), mk("c", "3=")]).map((i) => i.base64))
      .toEqual(["1=", "2=", "3="]);
  });
});
