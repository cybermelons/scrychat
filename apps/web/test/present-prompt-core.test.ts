import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PRESENT_PROMPT } from "../ui/src/present-prompt-core.js";

const chatPanel = readFileSync(
  new URL("../ui/src/ChatPanel.tsx", import.meta.url),
  "utf8",
);

describe("PRESENT_PROMPT", () => {
  it("is non-empty", () => {
    // send() returns early on an empty message, so an empty constant would
    // make the button silently do nothing.
    expect(PRESENT_PROMPT.trim().length).toBeGreaterThan(0);
  });

  it("uses the verb deck_present's own description keys off", () => {
    // The server injects no tool arguments, so the model chooses the call.
    // tools.ts: "Use when the user asks to present, walk through or
    // summarise a deck or its suggestions."
    expect(PRESENT_PROMPT.toLowerCase()).toMatch(/present|walk through|summarise/);
  });

  it("does not interpolate a deck name", () => {
    // server.ts builds its own [UI context: the user has deck "X" ...] line
    // from activeDeck. Naming the deck here too would state it twice.
    expect(PRESENT_PROMPT).not.toMatch(/\$\{|\{\{|%s/);
  });
});

describe("the Present button is wired", () => {
  it("exists with the anchor the board pins", () => {
    // #present-btn is the board's anchor for this pin; renaming it would
    // leave the pin floating over a control that no longer exists.
    expect(chatPanel).toMatch(/id="present-btn"/);
  });

  it("sends the turn through send()", () => {
    expect(chatPanel).toMatch(/send\(PRESENT_PROMPT\)/);
  });

  it("is disabled without an active deck", () => {
    // deck_present takes a required deck_name, and the model only learns the
    // deck from the server's activeDeck context line. With no deck selected
    // the turn cannot succeed, so the control must not offer it.
    expect(chatPanel).toMatch(/disabled=\{streaming \|\| !selected\}/);
  });

  it("is not placed inside SlideStrip", () => {
    // SlideStrip renders only once deck_present has already returned, so a
    // trigger there is reachable only after the thing it starts. The mockup
    // draws it in the strip; the real UI deliberately differs.
    const strip = chatPanel.slice(
      chatPanel.indexOf("function SlideStrip"),
      chatPanel.indexOf("function", chatPanel.indexOf("function SlideStrip") + 20),
    );
    expect(strip).not.toMatch(/present-btn/);
  });
});

describe("deck_present stays reachable", () => {
  it("is still allowlisted on the server", () => {
    const server = readFileSync(
      new URL("../src/server.ts", import.meta.url),
      "utf8",
    );
    // If it were dropped from allowedTools the button would post a turn the
    // model cannot fulfil, and the failure would look like a model problem.
    expect(server).toMatch(/mcp__scrychat__deck_present/);
  });

  it("the UI still renders the result the turn produces", () => {
    // The button and the renderer are two halves of one feature; a rename of
    // the matched tool name breaks the half that has no other test.
    expect(chatPanel).toMatch(/=== "deck_present"/);
  });
});
