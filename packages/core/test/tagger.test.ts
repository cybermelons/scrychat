import { describe, it, expect } from "vitest";
import { buildTagClosure } from "../src/ingest/tagger.js";

describe("buildTagClosure", () => {
  it("includes a self row for every tag", () => {
    const parents = new Map<string, string[]>([
      ["a", []],
      ["b", ["a"]],
    ]);
    const rows = buildTagClosure(parents);
    expect(rows).toContainEqual({ tag_id: "a", ancestor_id: "a" });
    expect(rows).toContainEqual({ tag_id: "b", ancestor_id: "b" });
  });

  it("walks multi-level ancestry transitively", () => {
    // removal-exile -> removal -> effect
    const parents = new Map<string, string[]>([
      ["effect", []],
      ["removal", ["effect"]],
      ["removal-exile", ["removal"]],
    ]);
    const rows = buildTagClosure(parents);
    const ancestorsOfLeaf = rows.filter((r) => r.tag_id === "removal-exile").map((r) => r.ancestor_id);
    expect(ancestorsOfLeaf.sort()).toEqual(["effect", "removal", "removal-exile"].sort());
  });

  it("handles multiple parents without duplicating ancestors", () => {
    const parents = new Map<string, string[]>([
      ["x", []],
      ["y", []],
      ["z", ["x", "y"]],
    ]);
    const rows = buildTagClosure(parents);
    const ancestorsOfZ = rows.filter((r) => r.tag_id === "z").map((r) => r.ancestor_id);
    expect(new Set(ancestorsOfZ)).toEqual(new Set(["x", "y", "z"]));
    expect(ancestorsOfZ.length).toBe(new Set(ancestorsOfZ).size); // no dupes
  });

  it("guards against cycles without infinite looping", () => {
    const parents = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", ["a"]],
    ]);
    const rows = buildTagClosure(parents);
    // Should terminate and include at least the self rows.
    expect(rows).toContainEqual({ tag_id: "a", ancestor_id: "a" });
    expect(rows).toContainEqual({ tag_id: "b", ancestor_id: "b" });
  });
});
