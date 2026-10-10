import { describe, it, expect } from "vitest";
import { parseConfig, applyConfigPatch, DEFAULT_CONFIG } from "../src/config-core.js";

describe("parseConfig", () => {
  it("accepts the legacy {linkifyPass: true} shape unchanged", () => {
    expect(parseConfig({ linkifyPass: true })).toEqual({
      linkifyPass: true,
      defaultExportFormat: "mtga",
      goldfishSeed: 0,
    });
  });

  it("accepts the legacy {linkifyPass: false} shape unchanged", () => {
    expect(parseConfig({ linkifyPass: false })).toEqual({
      linkifyPass: false,
      defaultExportFormat: "mtga",
      goldfishSeed: 0,
    });
  });

  it("defaults absent fields", () => {
    expect(parseConfig({})).toEqual(DEFAULT_CONFIG);
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(parseConfig(undefined)).toEqual(DEFAULT_CONFIG);
  });

  it("falls back to defaults for invalid field types", () => {
    expect(parseConfig({ linkifyPass: "yes", defaultExportFormat: "pdf" })).toEqual(DEFAULT_CONFIG);
  });

  it("defaults goldfishSeed to 0 when absent", () => {
    expect(parseConfig({ linkifyPass: true }).goldfishSeed).toBe(0);
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
      linkifyPass: true,
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
    const result = parseConfig({ linkifyPass: true, quotaTargets: { ramp: "bogus" } });
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
  const base = { linkifyPass: true, defaultExportFormat: "mtga" as const, goldfishSeed: 0 };

  it("merges a valid partial patch", () => {
    const { config, errors } = applyConfigPatch(base, { linkifyPass: false });
    expect(errors).toEqual([]);
    expect(config).toEqual({ linkifyPass: false, defaultExportFormat: "mtga", goldfishSeed: 0 });
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

  it("rejects a non-boolean linkifyPass as an error", () => {
    const { config, errors } = applyConfigPatch(base, { linkifyPass: "yes" });
    expect(errors).toEqual(["linkifyPass must be a boolean"]);
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
