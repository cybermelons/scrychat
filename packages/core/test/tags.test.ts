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

  it("searchTags ranks broad removal tags above narrow leaf tags", async () => {
    const results = await searchTags("removal", 10);
    const slugs = results.map((r) => r.slug);
    expect(slugs).toContain("spot-removal");
    expect(slugs).toContain("multi-removal");
    // within the same match tier, higher member count should sort first
    const spotIdx = slugs.indexOf("spot-removal");
    const battleIdx = slugs.indexOf("removal-battle");
    if (battleIdx !== -1) {
      expect(spotIdx).toBeLessThan(battleIdx);
    }
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
