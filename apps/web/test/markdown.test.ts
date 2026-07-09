import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../ui/src/markdown.js";

describe("renderMarkdown card refs (piped alias, issue #22)", () => {
  it("renders [[Card|alias]] with the alias as display text but the full name as data-card-name", () => {
    const html = renderMarkdown("Check out [[Teysa Karlov|Teysa]] for this deck.");
    expect(html).toContain('data-card-name="Teysa Karlov"');
    expect(html).toContain(">Teysa<");
    expect(html).not.toContain("[[");
    expect(html).not.toContain(">Teysa Karlov<");
  });

  it("still renders plain [[Card]] with no alias", () => {
    const html = renderMarkdown("Run [[Skullclamp]] in this deck.");
    expect(html).toContain('data-card-name="Skullclamp"');
    expect(html).toContain(">Skullclamp<");
  });

  it("renders ![[Card|alias]] embed with the alias as caption/alt", () => {
    const html = renderMarkdown("Here's the ramp piece: ![[Sol Ring|the Ring]]");
    expect(html).toContain('data-card-name="Sol Ring"');
    expect(html).toContain('alt="the Ring"');
    expect(html).toContain('<span class="card-embed-caption">the Ring</span>');
  });

  it("still renders plain ![[Card]] embed with no alias", () => {
    const html = renderMarkdown("![[Sol Ring]]");
    expect(html).toContain('data-card-name="Sol Ring"');
    expect(html).toContain('alt="Sol Ring"');
    expect(html).toContain('<span class="card-embed-caption">Sol Ring</span>');
  });

  it("renders a group chip with its members, coexisting with a piped ref in the same input", () => {
    const html = renderMarkdown(
      "[[group:ramp|Sol Ring; Arcane Signet]] and also consider [[Teysa Karlov|Teysa]]."
    );
    expect(html).toContain('class="card-group"');
    expect(html).toContain('data-group-label="ramp"');
    expect(html).toContain('data-group-names="Sol Ring;Arcane Signet"');
    expect(html).toContain("ramp (2)");
    expect(html).toContain('data-card-name="Teysa Karlov"');
    expect(html).toContain(">Teysa<");
  });

  it("leaves a malformed group (no pipe) as literal text, not a card-ref", () => {
    const html = renderMarkdown("Broken chip: [[group:ramp]] here.");
    expect(html).toContain("[[group:ramp]]");
    expect(html).not.toContain('data-card-name="group:ramp"');
    expect(html).not.toContain('class="card-group"');
  });
});
