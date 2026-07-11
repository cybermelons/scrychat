import { describe, it, expect } from "vitest";
import { parseArenaLog } from "../src/arena-log.js";

const OLDER_BLOB = {
  id: 100,
  payload: {
    "66091": 4,
    "66093": 2,
    "67312": 1,
    "70123": 3,
    "71000": 4,
  },
};

const NEWER_BLOB = {
  id: 200,
  payload: {
    "66091": 1, // changed count
    "66093": 2,
    "67312": 4, // changed count
    "70123": 3,
    "71000": 0, // changed count, zero is valid
    "99999": 2, // new id not present in older blob
  },
};

function buildFixtureLog(): string {
  const lines: string[] = [];

  lines.push("[UnityCrossThreadLogger]Some unrelated startup message");
  lines.push("[UnityCrossThreadLogger]==> Client.SceneChange {\"sceneName\":\"Home\"}");
  lines.push("garbage garbage garbage not even close to json {{{");

  // Truncated / broken JSON blob right after a marker - must be skipped.
  lines.push("[UnityCrossThreadLogger]<== PlayerInventory.GetPlayerCardsV3(1)");
  lines.push('{"id":1,"payload":{"1234":2,"5678"');

  lines.push('{"unrelated":"json blob","not":"a collection"}');

  // Older valid blob (single-line marker + JSON variant).
  lines.push(
    `[UnityCrossThreadLogger]<== PlayerInventory.GetPlayerCardsV3(100) ${JSON.stringify(OLDER_BLOB)}`,
  );

  lines.push("[UnityCrossThreadLogger]Some other mid-session noise");
  lines.push('{"random":{"nested":{"stuff": 1}}}');

  // Newer valid blob, on a following line after the marker.
  lines.push("[UnityCrossThreadLogger]<== PlayerInventory.GetPlayerCardsV3(200)");
  lines.push(JSON.stringify(NEWER_BLOB));

  lines.push("[UnityCrossThreadLogger]Trailing noise after everything");

  return lines.join("\n");
}

describe("parseArenaLog", () => {
  it("picks the newest valid collection blob and round-trips exact counts", () => {
    const result = parseArenaLog(buildFixtureLog());
    expect(result).not.toBeNull();
    expect(result!.cards).toEqual(NEWER_BLOB.payload);
  });

  it("returns null when the log has no valid collection blobs", () => {
    const text = [
      "[UnityCrossThreadLogger]==> Client.SceneChange {\"sceneName\":\"Home\"}",
      "some junk line",
      "[UnityCrossThreadLogger]<== PlayerInventory.GetPlayerCardsV3(1)",
      '{"id":1,"payload":{"1234":2}}', // only 1 entry, below the >=5 threshold
      "more junk",
    ].join("\n");
    expect(parseArenaLog(text)).toBeNull();
  });

  it("does not throw on garbage input", () => {
    expect(() => parseArenaLog("")).not.toThrow();
    expect(() => parseArenaLog("not json at all { [ } ] \" \\ ")).not.toThrow();
    expect(parseArenaLog("")).toBeNull();

    const noisy = "GetPlayerCardsV3".repeat(50) + "{{{{{{{ garbage";
    expect(() => parseArenaLog(noisy)).not.toThrow();
  });

  it("supports InventoryInfo marker variant", () => {
    const blob = {
      Cards: {
        "10001": 4,
        "10002": 2,
        "10003": 1,
        "10004": 3,
        "10005": 4,
      },
    };
    const text = `[UnityCrossThreadLogger]<== Deck.InventoryInfo ${JSON.stringify(blob)}`;
    const result = parseArenaLog(text);
    expect(result).not.toBeNull();
    expect(result!.cards).toEqual(blob.Cards);
  });

  it("picks whichever marker's blob appears LAST in the file, regardless of marker identity", () => {
    const inventoryInfoBlob = {
      Cards: {
        "20001": 4,
        "20002": 2,
        "20003": 1,
        "20004": 3,
        "20005": 4,
      },
    };
    const getPlayerCardsV3Blob = {
      payload: {
        "30001": 4,
        "30002": 2,
        "30003": 1,
        "30004": 3,
        "30005": 4,
      },
    };

    // Case A: InventoryInfo comes first, GetPlayerCardsV3 comes after -> the
    // later GetPlayerCardsV3 blob should win even though InventoryInfo is
    // iterated separately.
    const textA = [
      `[UnityCrossThreadLogger]<== Deck.InventoryInfo ${JSON.stringify(inventoryInfoBlob)}`,
      "[UnityCrossThreadLogger]Some mid-session noise",
      `[UnityCrossThreadLogger]<== PlayerInventory.GetPlayerCardsV3(1) ${JSON.stringify(getPlayerCardsV3Blob)}`,
    ].join("\n");
    const resultA = parseArenaLog(textA);
    expect(resultA).not.toBeNull();
    expect(resultA!.cards).toEqual(getPlayerCardsV3Blob.payload);

    // Case B: reversed order -> the later InventoryInfo blob should win.
    const textB = [
      `[UnityCrossThreadLogger]<== PlayerInventory.GetPlayerCardsV3(1) ${JSON.stringify(getPlayerCardsV3Blob)}`,
      "[UnityCrossThreadLogger]Some mid-session noise",
      `[UnityCrossThreadLogger]<== Deck.InventoryInfo ${JSON.stringify(inventoryInfoBlob)}`,
    ].join("\n");
    const resultB = parseArenaLog(textB);
    expect(resultB).not.toBeNull();
    expect(resultB!.cards).toEqual(inventoryInfoBlob.Cards);
  });

  it("retries the next '{' after a marker when the first balanced JSON parses but has no collection blob", () => {
    const realBlob = {
      payload: {
        "40001": 4,
        "40002": 2,
        "40003": 1,
        "40004": 3,
        "40005": 4,
      },
    };
    // After the marker, the first balanced JSON is unrelated (parses fine,
    // no collection-shaped data inside); the real collection blob follows
    // as the next '{' on a subsequent line.
    const text = [
      "[UnityCrossThreadLogger]<== PlayerInventory.GetPlayerCardsV3(1)",
      '{"unrelated":"json blob","not":"a collection"}',
      JSON.stringify(realBlob),
    ].join("\n");
    const result = parseArenaLog(text);
    expect(result).not.toBeNull();
    expect(result!.cards).toEqual(realBlob.payload);
  });
});
