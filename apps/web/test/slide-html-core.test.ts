import { describe, expect, it } from "vitest";
import { checkSlideHtml } from "../ui/src/slide-html-core.js";

describe("checkSlideHtml", () => {
  it("accepts plain layout markup and returns it verbatim", () => {
    const html = '<div style="color:#9ece6a"><h2>Ramp</h2><p>Eight sources.</p></div>';
    expect(checkSlideHtml(html)).toBe(html);
  });

  it("accepts a table with colspan", () => {
    const html = "<table><tbody><tr><td colspan=2>Lands</td></tr></tbody></table>";
    expect(checkSlideHtml(html)).toBe(html);
  });

  it("rejects a non-string and an empty string", () => {
    expect(checkSlideHtml(undefined)).toBeNull();
    expect(checkSlideHtml(42)).toBeNull();
    expect(checkSlideHtml("")).toBeNull();
  });

  // Boundary hardcoded, not MAX_HTML_LEN: a test written with the constant it
  // tests moves with a defect and can never fail.
  it("accepts 1600 chars and rejects 1601", () => {
    const pad = (n: number) => "<p>" + "x".repeat(n - 7) + "</p>";
    expect(checkSlideHtml(pad(1600))).not.toBeNull();
    expect(checkSlideHtml(pad(1601))).toBeNull();
  });

  describe("outbound requests — the thing sandbox='' does not stop", () => {
    // These use ALLOWED tags on purpose. Written with <img>, the tag guard
    // rejects them and the URL guard is never exercised -- the test would pass
    // with the URL check deleted. Proven: it does.
    it("rejects an absolute URL inside an allowed tag", () => {
      expect(checkSlideHtml('<p>see http://evil.test/x</p>')).toBeNull();
    });
    it("rejects a protocol-relative URL inside an allowed tag", () => {
      expect(checkSlideHtml('<div style="background://evil.test/x">hi</div>')).toBeNull();
    });
    it("rejects a CSS url()", () => {
      expect(checkSlideHtml('<div style="background:url(/x.png)">hi</div>')).toBeNull();
    });
    it("rejects @import", () => {
      expect(checkSlideHtml("<style>@import 'x.css'</style>")).toBeNull();
    });
    it("rejects a data: scheme", () => {
      expect(checkSlideHtml('<div style="x:data:text/html,y">hi</div>')).toBeNull();
    });
  });

  describe("tags and attributes", () => {
    it("rejects script, iframe, meta, style, img, a, form, input", () => {
      for (const t of ["script", "iframe", "meta", "style", "img", "a", "form", "input"]) {
        expect(checkSlideHtml(`<${t}>x</${t}>`)).toBeNull();
      }
    });
    it("rejects an event handler attribute", () => {
      expect(checkSlideHtml('<div onclick="x()">hi</div>')).toBeNull();
    });
    it("rejects class, id and src attributes", () => {
      expect(checkSlideHtml('<div class="x">hi</div>')).toBeNull();
      expect(checkSlideHtml('<div id="x">hi</div>')).toBeNull();
    });
    it("rejects a closing tag that is not allowed", () => {
      expect(checkSlideHtml("<div>hi</script></div>")).toBeNull();
    });
    it("rejects a tag with whitespace before the name", () => {
      expect(checkSlideHtml("< script >x</script>")).toBeNull();
    });
    it("rejects an uppercase disallowed tag", () => {
      expect(checkSlideHtml("<SCRIPT>x</SCRIPT>")).toBeNull();
    });
  });

  it("rejects an entity-encoded colon", () => {
    expect(checkSlideHtml('<div style="x&#58;y">hi</div>')).toBeNull();
  });
  // Regression guard for the producer, not the validator. deck_present builds
  // the Quotas slide as html; the per-cell-styled first draft measured 1410 and
  // was rejected outright, so the slide vanished exactly when all five quotas
  // were failing. This reproduces that worst case (5 quotas, all OFF, 3-digit
  // counts) against the real cap. If tools.ts makes the markup heavier again,
  // this fails instead of the feature silently disappearing.
  it("accepts the worst-case Quotas slide deck_present can emit", () => {
    const cell = 'style="padding:2px 6px"';
    const rows = ["lands", "ramp", "draw", "interaction", "wipes"]
      .map(
        (k) =>
          `<tr><td ${cell}>${k}</td><td ${cell}>999</td>` +
          `<td ${cell}>999</td>` +
          `<td style="padding:2px 6px;color:#e0af68">OFF</td></tr>`,
      )
      .join("");
    const html =
      `<div style="font:12px system-ui;color:#c0caf5">` +
      `<table><thead><tr style="color:#787c99">` +
      `<th ${cell}>tag</th><th ${cell}>have</th><th ${cell}>want</th><th></th>` +
      `</tr></thead><tbody>${rows}</tbody></table></div>`;
    expect(html.length).toBeLessThan(1600);
    expect(checkSlideHtml(html)).toBe(html);
  });
});
