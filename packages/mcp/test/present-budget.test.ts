import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  TOOL_RESULT_BUDGET_CHARS,
  PRESENT_BUDGET_SLACK,
  fitPresentSlides,
  presentPayloadLength,
  type BudgetSlide,
} from "../src/present-budget.js";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

/*
 * Rebuilds deck_present's four slides using only values the producer can
 * actually emit, so a worst case here is a real one rather than a contrived
 * number:
 *  - quotaCheck is a FIXED five keys (lands/ramp/draw/interaction/wipes) from
 *    QuotaTargets in packages/core/src/decks.ts -- not user-named tags.
 *  - `want` is a "min-max" string, per quota() at decks.ts:606.
 *  - the curve bucket is `cmc >= 7 ? "7+" : String(cmc)` (decks.ts:722), so
 *    there are at most EIGHT buckets, 0..6 and "7+".
 * Mirroring the producer's markup is deliberate: if tools.ts grows a column,
 * this stops reflecting it and the sizes below must be re-measured, which is
 * exactly when a human should look again.
 */
const QUOTA_KEYS = ["lands", "ramp", "draw", "interaction", "wipes"] as const;
const CURVE_BUCKETS = ["0", "1", "2", "3", "4", "5", "6", "7+"] as const;
const cell = 'style="padding:2px 6px"';

function buildSlides(opts: {
  allOff: boolean;
  pendingText: string;
}): BudgetSlide[] {
  const quotas = QUOTA_KEYS.map((k) => ({
    k,
    have: 100,
    want: "100-100",
    ok: !opts.allOff,
  }));
  const rows = quotas
    .map(
      (q) =>
        `<tr><td ${cell}>${q.k}</td><td ${cell}>${q.have}</td>` +
        `<td ${cell}>${q.want}</td>` +
        `<td style="padding:2px 6px;color:${q.ok ? "#9ece6a" : "#e0af68"}">` +
        `${q.ok ? "ok" : "OFF"}</td></tr>`,
    )
    .join("");
  const html =
    `<div style="font:12px system-ui;color:#c0caf5">` +
    `<table><thead><tr style="color:#787c99">` +
    `<th ${cell}>tag</th><th ${cell}>have</th><th ${cell}>want</th><th></th>` +
    `</tr></thead><tbody>${rows}</tbody></table></div>`;
  return [
    {
      title: "Curve",
      text: "100/100 cards",
      chart: {
        type: "bar",
        data: CURVE_BUCKETS.map((x) => ({ x, y: 99 })),
        x: "mana value",
        y: "cards",
        caption: "nonland cards",
      },
    },
    {
      title: "Quotas",
      text: quotas
        .map((q) => `${q.k} ${q.have} (want ${q.want}) ${q.ok ? "ok" : "OFF"}`)
        .join("\n")
        .slice(0, 320),
      html,
    },
    {
      title: "Queue",
      chart: {
        type: "bar",
        data: [
          { x: "pending", y: 99 },
          { x: "accepted", y: 99 },
          { x: "rejected", y: 99 },
        ],
        x: "status",
        y: "suggestions",
      },
    },
    { title: "Pending", text: opts.pendingText },
  ];
}

describe("the budget mirrors the web app", () => {
  it("equals TOOL_RESULT_MAX_CHARS in apps/web/src/server.ts", () => {
    const server = read("../../../apps/web/src/server.ts");
    const m = server.match(
      /export const TOOL_RESULT_MAX_CHARS\s*=\s*(\d+)\s*;/,
    );
    // If this is null the constant was renamed or un-exported -- the mirror
    // cannot be checked at all, which is itself the failure.
    expect(m, "TOOL_RESULT_MAX_CHARS not found/exported in server.ts").not.toBeNull();
    expect(Number(m![1])).toBe(TOOL_RESULT_BUDGET_CHARS);
  });

  it("is the number the web app actually slices at", () => {
    const server = read("../../../apps/web/src/server.ts");
    // The constant is only a budget if truncateResult uses it; a renamed-but-
    // unused constant would keep the test above green.
    expect(server).toMatch(/TOOL_RESULT_MAX_CHARS/);
    const uses = server.match(/TOOL_RESULT_MAX_CHARS/g) ?? [];
    expect(uses.length).toBeGreaterThan(1);
  });
});

describe("deck_present fits its worst case", () => {
  it("the realistic case was already near the line", () => {
    // Not an aspiration -- a measurement, recorded so a future change that
    // eats the remaining headroom shows up as a number moving.
    const slides = buildSlides({
      allOff: false,
      pendingText: "swap Sol Ring > Mana Crypt",
    });
    const len = presentPayloadLength({
      kind: "slides",
      deck: "commander-deck",
      slides,
    });
    expect(len).toBeLessThan(TOOL_RESULT_BUDGET_CHARS);
    // Documents the margin that motivated the fitter: under 300 chars spare.
    expect(TOOL_RESULT_BUDGET_CHARS - len).toBeLessThan(300);
  });

  it("the unfitted worst case OVERFLOWS the budget", () => {
    // This is the defect. If this assertion ever fails, the producer shrank
    // and the fitter may no longer be load-bearing -- re-measure before
    // deleting anything.
    const slides = buildSlides({ allOff: true, pendingText: "s".repeat(320) });
    const len = presentPayloadLength({
      kind: "slides",
      deck: "D".repeat(60),
      slides,
    });
    expect(len).toBeGreaterThan(TOOL_RESULT_BUDGET_CHARS);
  });

  it("fits the worst case by dropping whole slides", () => {
    const slides = buildSlides({ allOff: true, pendingText: "s".repeat(320) });
    const fitted = fitPresentSlides("D".repeat(60), slides);
    expect(fitted.length).toBeLessThanOrEqual(
      TOOL_RESULT_BUDGET_CHARS - PRESENT_BUDGET_SLACK,
    );
    expect(fitted.dropped).toBeGreaterThan(0);
    // Priority order is preserved: Curve survives, the tail goes.
    expect(fitted.slides[0]?.title).toBe("Curve");
    expect(fitted.slides.length).toBe(slides.length - fitted.dropped);
  });

  it("leaves a payload that already fits completely alone", () => {
    const slides = buildSlides({ allOff: false, pendingText: "swap A > B" });
    const fitted = fitPresentSlides("deck", slides);
    expect(fitted.dropped).toBe(0);
    expect(fitted.slides).toHaveLength(slides.length);
  });

  it("never drops the last slide, even if one cannot fit", () => {
    const huge: BudgetSlide[] = [{ title: "Curve", text: "x".repeat(5000) }];
    const fitted = fitPresentSlides("deck", huge);
    expect(fitted.slides).toHaveLength(1);
    // Reported honestly as still-over rather than silently emptied.
    expect(fitted.length).toBeGreaterThan(TOOL_RESULT_BUDGET_CHARS);
  });

  it("the fitted result stays valid JSON the UI can parse", () => {
    const slides = buildSlides({ allOff: true, pendingText: "s".repeat(320) });
    const fitted = fitPresentSlides("D".repeat(60), slides);
    const wire = JSON.stringify({
      kind: "slides",
      deck: "D".repeat(60),
      slides: fitted.slides,
    });
    // The whole point: the web app slices at the budget, and after fitting
    // that slice is a no-op, so the result still parses.
    const sliced = wire.slice(0, TOOL_RESULT_BUDGET_CHARS);
    expect(sliced).toBe(wire);
    expect(() => JSON.parse(sliced)).not.toThrow();
  });
});

describe("the producer actually uses the fitter", () => {
  it("deck_present returns fitted slides, not the raw array", () => {
    const tools = read("../src/tools.ts");
    expect(tools).toMatch(/fitPresentSlides\(deck\.name, slides\)/);
    expect(tools).toMatch(/slides: fitted\.slides/);
    // The unfitted return would keep every other assertion in this file green.
    expect(tools).not.toMatch(/return \{ kind: "slides", deck: deck\.name, slides \}/);
  });
});
