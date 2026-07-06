import { describe, it, expect } from "vitest";
import { searchTags, getTag } from "../src/tags.js";

describe("tags", () => {
  it("searchTags finds removal-related tags with descriptions", async () => {
    const results = await searchTags("removal");
    expect(results.length).toBeGreaterThanOrEqual(5);
    // Not every sub-tag in the real index carries a description (many
    // removal-* leaf tags are null), but at least some results should.
    expect(results.some((r) => r.description)).toBe(true);
  });

  it("getTag resolves an exact slug", async () => {
    const tag = await getTag("token-doubler");
    expect(tag?.slug).toBe("token-doubler");
    expect(tag?.label).toBe("token doubler");
  });

  it("getTag returns null for an unknown slug", async () => {
    const tag = await getTag("this-slug-does-not-exist-zzz");
    expect(tag).toBeNull();
  });
});
