import { describe, it, expect } from "vitest";
import { stackOffset, snapTop, frontIndex, groupStarts, groupOf, jumpGroupStart } from "../ui/src/flip-core.js";

const H = 390, HDR = 48, CAP = 6;

describe("flip-core", () => {
  it("clamps the cascade offset at cap headers", () => {
    expect(stackOffset(0, HDR, CAP)).toBe(0);
    expect(stackOffset(3, HDR, CAP)).toBe(144);
    expect(stackOffset(6, HDR, CAP)).toBe(288);
    expect(stackOffset(99, HDR, CAP)).toBe(288);
    expect(stackOffset(-1, HDR, CAP)).toBe(0);
  });
  it("snap points: growing cascade then full card steps", () => {
    expect(snapTop(1, H, HDR, CAP)).toBe(342);
    expect(snapTop(6, H, HDR, CAP)).toBe(6 * 342);
    expect(snapTop(7, H, HDR, CAP)).toBe(6 * 342 + 390);
  });
  it("frontIndex inverts snapTop for every card and rounds between", () => {
    for (let i = 0; i < 20; i++) expect(frontIndex(snapTop(i, H, HDR, CAP), H, HDR, CAP, 20)).toBe(i);
    expect(frontIndex(snapTop(3, H, HDR, CAP) + 100, H, HDR, CAP, 20)).toBe(3);
    expect(frontIndex(snapTop(3, H, HDR, CAP) + 200, H, HDR, CAP, 20)).toBe(4);
    expect(frontIndex(snapTop(12, H, HDR, CAP) + 100, H, HDR, CAP, 20)).toBe(12);
    expect(frontIndex(1e9, H, HDR, CAP, 20)).toBe(19);
    expect(frontIndex(-5, H, HDR, CAP, 20)).toBe(0);
    expect(frontIndex(10, H, HDR, CAP, 0)).toBe(0);
  });
  it("group boundaries", () => {
    const st = groupStarts([3, 4, 2]);
    expect(st).toEqual([0, 3, 7]);
    expect([0, 2, 3, 6, 7, 8].map((f) => groupOf(f, st))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(groupStarts([])).toEqual([]);
    expect(groupOf(5, [])).toBe(0);
  });
  it("jumpGroupStart next/prev", () => {
    const st = [0, 3, 7];
    expect(jumpGroupStart(1, st, 1)).toBe(3);
    expect(jumpGroupStart(8, st, 1)).toBe(7); // last group: stay
    expect(jumpGroupStart(4, st, -1)).toBe(3); // mid-group: own start first
    expect(jumpGroupStart(3, st, -1)).toBe(0);
    expect(jumpGroupStart(0, st, -1)).toBe(0);
    expect(jumpGroupStart(0, [], 1)).toBe(0);
  });
});
