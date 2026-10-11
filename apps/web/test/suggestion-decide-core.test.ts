import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { decideBody } from "../ui/src/suggestion-decide-core.js";

describe("decideBody", () => {
  it("omits note entirely when none is given", () => {
    expect(decideBody()).toBe("{}");
  });

  it("carries a note the human typed", () => {
    expect(JSON.parse(decideBody("too slow at five"))).toEqual({
      note: "too slow at five",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(JSON.parse(decideBody("  curve is heavy  "))).toEqual({
      note: "curve is heavy",
    });
  });

  it("treats a whitespace-only note as absent", () => {
    // core guards with `if (note)`, so "   " would be dropped there anyway;
    // sending it would imply a note was offered.
    expect(decideBody("   ")).toBe("{}");
    expect(decideBody("")).toBe("{}");
  });

  it("produces a body the server route can read", () => {
    // The route reads req.body?.note after express.json(). Round-trip the
    // exact string to prove the key name matches what server.ts looks up.
    const parsed = JSON.parse(decideBody("why not"));
    expect(parsed.note).toBe("why not");
  });
});

describe("the component actually uses it", () => {
  // Guards the defect's real shape: decideBody can be correct while
  // Suggestions.tsx still sends a hardcoded body. The module is only worth
  // anything if the caller routes through it.
  const src = readFileSync(
    new URL("../ui/src/Suggestions.tsx", import.meta.url),
    "utf8",
  );

  it("imports decideBody", () => {
    expect(src).toMatch(/decideBody/);
  });

  it("sends no hardcoded empty body", () => {
    expect(src).not.toMatch(/body:\s*"\{\}"/);
  });

  it("passes the note through to decide()", () => {
    // The note must reach the request, not just the textarea's state.
    expect(src).toMatch(/body:\s*decideBody\(/);
  });
});

describe("the server route reads the key this body uses", () => {
  it("server.ts looks up req.body?.note", () => {
    const server = readFileSync(
      new URL("../src/server.ts", import.meta.url),
      "utf8",
    );
    // If the route is ever changed to read a different field, this fails
    // instead of the note silently vanishing again.
    expect(server).toMatch(/req\.body\?\.note/);
  });
});
