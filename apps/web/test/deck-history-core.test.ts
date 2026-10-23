import { describe, it, expect } from "vitest";
import { createDeckHistory, mergeFeedback, unknownMetaField } from "../src/deck-history-core.js";

describe("deck history ring", () => {
  it("lists newest first, case-insensitive", () => {
    const h = createDeckHistory();
    h.record("Foo", "a", "t1");
    h.record("foo", "b", "t2");
    expect(h.list("FOO").map((e) => e.action)).toEqual(["b", "a"]);
  });
  it("caps at 200 dropping oldest", () => {
    const h = createDeckHistory();
    for (let i = 0; i < 205; i++) h.record("d", String(i));
    const l = h.list("d");
    expect(l).toHaveLength(200);
    expect(l[0].action).toBe("204");
    expect(l[199].action).toBe("5");
  });
  it("rename moves the ring", () => {
    const h = createDeckHistory();
    h.record("old", "x");
    h.rename("old", "New");
    expect(h.list("old")).toEqual([]);
    expect(h.list("new")).toHaveLength(1);
  });
});

describe("meta + feedback validation", () => {
  it("rejects unknown meta keys", () => {
    expect(unknownMetaField({ bracket: 2, themes: [] })).toBeNull();
    expect(unknownMetaField({ bogus: 1 })).toBe("unknown field: bogus");
  });
  it("merges feedback, 0 deletes, strict values", () => {
    expect(mergeFeedback({ a: 1 }, { a: 0, b: -1 })).toEqual({ b: -1 });
    expect(mergeFeedback(undefined, { a: 2 })).toBeNull();
    expect(mergeFeedback(undefined, { a: "1" })).toBeNull();
    expect(mergeFeedback(undefined, [1])).toBeNull();
    expect(mergeFeedback(undefined, null)).toBeNull();
  });
});
