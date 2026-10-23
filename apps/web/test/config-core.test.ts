import { ALLOWED_TOOLS } from "../src/tools-core.js";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveQuotaTargets } from "@scrychat/core";
import { parseConfig, applyConfigPatch, DEFAULT_CONFIG } from "../src/config-core.js";

describe("parseConfig", () => {
  it("parses a legacy file carrying linkifyPass, ignoring the key", () => {
    expect(parseConfig({ linkifyPass: true })).toEqual(DEFAULT_CONFIG);
  });

  it("defaults absent fields", () => {
    expect(parseConfig({})).toEqual(DEFAULT_CONFIG);
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(parseConfig(undefined)).toEqual(DEFAULT_CONFIG);
  });

  it("falls back to defaults for invalid field types", () => {
    expect(parseConfig({ defaultExportFormat: "pdf" })).toEqual(DEFAULT_CONFIG);
  });

  it("defaults goldfishSeed to 0 when absent", () => {
    expect(parseConfig({}).goldfishSeed).toBe(0);
  });

  it("keeps a valid goldfishSeed", () => {
    expect(parseConfig({ goldfishSeed: 42 }).goldfishSeed).toBe(42);
  });

  it("falls back to the default goldfishSeed on invalid values", () => {
    for (const bad of ["7", 1.5, -1, NaN, 2147483648, null]) {
      expect(parseConfig({ goldfishSeed: bad }).goldfishSeed).toBe(0);
    }
  });

  it("drops junk quotaTargets fields and keeps valid partial fields", () => {
    const result = parseConfig({
      quotaTargets: {
        lands: [30, 35],
        ramp: "bogus",
        wipes: [5, 2], // min > max, invalid
        notARealField: [1, 2],
      },
    });
    expect(result.quotaTargets).toEqual({ lands: [30, 35] });
    expect(result).not.toHaveProperty("quotaTargets.ramp");
  });

  it("omits quotaTargets entirely when no valid fields survive", () => {
    const result = parseConfig({ quotaTargets: { ramp: "bogus" } });
    expect(result.quotaTargets).toBeUndefined();
  });

  it("accepts a fully valid quotaTargets object", () => {
    const result = parseConfig({
      quotaTargets: { lands: [36, 38], ramp: [10, 12], draw: [10, 12], interaction: [8, 10], wipes: [2, 4] },
    });
    expect(result.quotaTargets).toEqual({
      lands: [36, 38],
      ramp: [10, 12],
      draw: [10, 12],
      interaction: [8, 10],
      wipes: [2, 4],
    });
  });
});

describe("applyConfigPatch", () => {
  const base = { defaultExportFormat: "mtga" as const, goldfishSeed: 0 };

  it("merges a valid partial patch", () => {
    const { config, errors } = applyConfigPatch(base, { defaultExportFormat: "moxfield" });
    expect(errors).toEqual([]);
    expect(config).toEqual({ defaultExportFormat: "moxfield", goldfishSeed: 0 });
  });

  it("merges a valid defaultExportFormat patch", () => {
    const { config, errors } = applyConfigPatch(base, { defaultExportFormat: "plain" });
    expect(errors).toEqual([]);
    expect(config.defaultExportFormat).toBe("plain");
  });

  it("merges a valid goldfishSeed patch", () => {
    const { config, errors } = applyConfigPatch(base, { goldfishSeed: 1234 });
    expect(errors).toEqual([]);
    expect(config.goldfishSeed).toBe(1234);
  });

  it("accepts the goldfishSeed bounds 0 and 2147483647", () => {
    expect(applyConfigPatch(base, { goldfishSeed: 0 }).errors).toEqual([]);
    expect(applyConfigPatch(base, { goldfishSeed: 2147483647 }).config.goldfishSeed).toBe(2147483647);
  });

  it.each([
    ["non-number", "7"],
    ["non-integer", 1.5],
    ["negative", -1],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["above int32 max", 2147483648],
  ])("rejects a %s goldfishSeed, leaving config unchanged", (_label, value) => {
    const { config, errors } = applyConfigPatch(base, { goldfishSeed: value });
    expect(errors).toEqual(["goldfishSeed must be an integer from 0 to 2147483647"]);
    expect(config).toEqual(base);
  });

  it("rejects unknown top-level keys as errors, leaving config unchanged", () => {
    const { config, errors } = applyConfigPatch(base, { bogus: 1 });
    expect(errors).toEqual(["unknown field: bogus"]);
    expect(config).toEqual(base);
  });

  it("rejects a bad enum value as an error, leaving config unchanged", () => {
    const { config, errors } = applyConfigPatch(base, { defaultExportFormat: "pdf" });
    expect(errors.length).toBeGreaterThan(0);
    expect(config).toEqual(base);
  });

  it("rejects a PATCH of the removed linkifyPass key as unknown", () => {
    const { config, errors } = applyConfigPatch(base, { linkifyPass: true });
    expect(errors).toEqual(["unknown field: linkifyPass"]);
    expect(config).toEqual(base);
  });

  it("replaces the whole quotaTargets object on patch", () => {
    const withTargets = { ...base, quotaTargets: { lands: [36, 38] as [number, number] } };
    const { config, errors } = applyConfigPatch(withTargets, {
      quotaTargets: { ramp: [11, 13] },
    });
    expect(errors).toEqual([]);
    expect(config.quotaTargets).toEqual({ ramp: [11, 13] });
  });

  it("clears the quotaTargets override via null", () => {
    const withTargets = { ...base, quotaTargets: { lands: [36, 38] as [number, number] } };
    const { config, errors } = applyConfigPatch(withTargets, { quotaTargets: null });
    expect(errors).toEqual([]);
    expect(config.quotaTargets).toBeUndefined();
  });

  it("clears the quotaTargets override via {}", () => {
    const withTargets = { ...base, quotaTargets: { lands: [36, 38] as [number, number] } };
    const { config, errors } = applyConfigPatch(withTargets, { quotaTargets: {} });
    expect(errors).toEqual([]);
    expect(config.quotaTargets).toBeUndefined();
  });

  it("errors on invalid quotaTargets field values", () => {
    const { config, errors } = applyConfigPatch(base, { quotaTargets: { lands: [40, 10] } });
    expect(errors.length).toBeGreaterThan(0);
    expect(config).toEqual(base);
  });

  it("errors on unknown quotaTargets fields", () => {
    const { errors } = applyConfigPatch(base, { quotaTargets: { fake: [1, 2] } });
    expect(errors).toEqual(["unknown quotaTargets field: fake"]);
  });

  it("rejects a non-object patch", () => {
    const { config, errors } = applyConfigPatch(base, "nope");
    expect(errors.length).toBeGreaterThan(0);
    expect(config).toEqual(base);
  });
});

describe("wincon quota target and deck_set_meta allowlist", () => {
  const base = { defaultExportFormat: "mtga" as const, goldfishSeed: 0 };

  it("PATCH persists wincon and it resolves to [1,3]; [3,1] is rejected", () => {
    const ok = applyConfigPatch(base, { quotaTargets: { wincon: [1, 3] } });
    expect(ok.errors).toEqual([]);
    expect(resolveQuotaTargets(ok.config.quotaTargets).wincon).toEqual([1, 3]);
    const bad = applyConfigPatch(base, { quotaTargets: { wincon: [3, 1] } });
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it("deck_set_meta is allowlisted and no write tool is", () => {
    const allowed = ALLOWED_TOOLS.join("\n");
    expect(allowed).toContain("mcp__scrychat__deck_set_meta");
    expect(allowed).not.toMatch(/^(Bash|Write|Edit|WebFetch)$/m);
  });
});
