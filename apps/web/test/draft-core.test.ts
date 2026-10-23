import { describe, it, expect } from "vitest";
import { draftBarText, draftSaveName, afterDiscard } from "../ui/src/draft-core.js";

const d = (name: string, draft?: true) => ({ name, commander: "", updatedAt: "", ...(draft ? { draft } : {}) });

describe("draft-core", () => {
  it("shows the draft bar only for drafts", () => {
    expect(draftBarText(d("a", true))).toBe("New deck — unsaved");
    expect(draftBarText(d("a"))).toBeNull();
    expect(draftBarText(null)).toBeNull();
  });
  it("prefills the save name from the commander", () => {
    expect(draftSaveName(" Krenko, Mob Boss ")).toBe("Krenko, Mob Boss");
    expect(draftSaveName("")).toBe("");
  });
  it("returns to the previous deck if it still exists and is saved", () => {
    const list = [d("x"), d("untitled-1", true)];
    expect(afterDiscard(list, "x")).toBe("x");
    expect(afterDiscard(list, "gone")).toBeNull();
    expect(afterDiscard(list, "untitled-1")).toBeNull();
  });
});
