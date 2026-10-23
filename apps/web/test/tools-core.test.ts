import { describe, it, expect } from "vitest";
import { ALLOWED_TOOLS, DISALLOWED_TOOLS } from "../src/tools-core.js";

describe("allowedTools boundary", () => {
  it("contains only scrychat MCP tools (no built-in tools)", () => {
    for (const t of ALLOWED_TOOLS) expect(t.startsWith("mcp__scrychat__")).toBe(true);
  });
  it("has none of the dangerous built-ins", () => {
    for (const bad of ["Read", "Grep", "Glob", "Bash", "Write", "Edit", "NotebookEdit", "WebFetch", "WebSearch"]) {
      expect(ALLOWED_TOOLS as readonly string[]).not.toContain(bad);
    }
  });
  it("has no duplicates and 22 entries", () => {
    expect(new Set(ALLOWED_TOOLS).size).toBe(ALLOWED_TOOLS.length);
    expect(ALLOWED_TOOLS.length).toBe(22);
  });
  it("still denies the dangerous built-ins explicitly", () => {
    for (const bad of ["Bash", "Write", "Edit", "WebFetch"]) expect(DISALLOWED_TOOLS as readonly string[]).toContain(bad);
  });
});
