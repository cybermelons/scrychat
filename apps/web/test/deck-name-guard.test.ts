import { describe, it, expect } from "vitest";
import { isValidDeckName } from "../src/deck-name-core.js";

describe("isValidDeckName", () => {
  it("accepts names with spaces, commas, and apostrophes", () => {
    expect(isValidDeckName("Trostani, Selesnya's Voice")).toBe(true);
    expect(isValidDeckName("My Deck")).toBe(true);
    expect(isValidDeckName("tmp-34-http-check")).toBe(true);
  });

  it("rejects path separators", () => {
    expect(isValidDeckName("foo/bar")).toBe(false);
    expect(isValidDeckName("foo\\bar")).toBe(false);
    expect(isValidDeckName("../../etc/passwd")).toBe(false);
  });

  it("rejects null bytes", () => {
    expect(isValidDeckName("foo\0bar")).toBe(false);
  });

  it("rejects empty and overlong names", () => {
    expect(isValidDeckName("")).toBe(false);
    expect(isValidDeckName("a".repeat(129))).toBe(false);
    expect(isValidDeckName("a".repeat(128))).toBe(true);
  });

  it("rejects all-punctuation names, including . and ..", () => {
    expect(isValidDeckName(".")).toBe(false);
    expect(isValidDeckName("..")).toBe(false);
    expect(isValidDeckName("---")).toBe(false);
    expect(isValidDeckName("!!!")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidDeckName(undefined)).toBe(false);
    expect(isValidDeckName(null)).toBe(false);
    expect(isValidDeckName(123)).toBe(false);
    expect(isValidDeckName({})).toBe(false);
  });
});
