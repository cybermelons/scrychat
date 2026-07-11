/**
 * Pure, testable helpers for scrychat.config.json (issue #37 settings
 * surface). No fs, no network — server.ts owns reading/writing the file and
 * delegates parsing/patching here so both are unit-testable.
 *
 * The file predates this module and originally only had `linkifyPass`
 * (`{"linkifyPass": true}`); parseConfig must keep accepting that shape
 * unchanged.
 */

import type { QuotaTargets } from "@scrychat/core";

export type ScrychatConfig = {
  linkifyPass: boolean;
  defaultExportFormat: "mtga" | "plain" | "moxfield";
  quotaTargets?: Partial<QuotaTargets>;
};

export const DEFAULT_CONFIG: ScrychatConfig = {
  linkifyPass: true,
  defaultExportFormat: "mtga",
};

const EXPORT_FORMATS = ["mtga", "plain", "moxfield"] as const;
const QUOTA_TARGET_FIELDS = ["lands", "ramp", "draw", "interaction", "wipes"] as const;

function isExportFormat(value: unknown): value is ScrychatConfig["defaultExportFormat"] {
  return typeof value === "string" && (EXPORT_FORMATS as readonly string[]).includes(value);
}

/** A valid quota-target field value: a 2-tuple of finite numbers, min <= max. */
function isValidTuple(value: unknown): value is [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [min, max] = value;
  return (
    typeof min === "number" &&
    typeof max === "number" &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min <= max
  );
}

/**
 * Keep only the fields of a candidate quotaTargets object that are valid
 * 2-tuples; drop everything else. Returns undefined if nothing survives (so
 * the file/config doesn't carry an empty `{}` around).
 */
function sanitizeQuotaTargets(value: unknown): Partial<QuotaTargets> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const src = value as Record<string, unknown>;
  const out: Partial<QuotaTargets> = {};
  for (const field of QUOTA_TARGET_FIELDS) {
    const candidate = src[field];
    if (isValidTuple(candidate)) {
      out[field] = candidate;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Parse a raw JSON value (already `JSON.parse`d) into a ScrychatConfig.
 * Field-wise validation: unknown/invalid/missing fields silently fall back
 * to defaults. Legacy files with just `{"linkifyPass": true}` parse fine —
 * `defaultExportFormat` falls back to the default and `quotaTargets` is
 * omitted.
 */
export function parseConfig(raw: unknown): ScrychatConfig {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_CONFIG };
  const src = raw as Record<string, unknown>;

  const linkifyPass = typeof src.linkifyPass === "boolean" ? src.linkifyPass : DEFAULT_CONFIG.linkifyPass;
  const defaultExportFormat = isExportFormat(src.defaultExportFormat)
    ? src.defaultExportFormat
    : DEFAULT_CONFIG.defaultExportFormat;
  const quotaTargets = sanitizeQuotaTargets(src.quotaTargets);

  return {
    linkifyPass,
    defaultExportFormat,
    ...(quotaTargets ? { quotaTargets } : {}),
  };
}

const KNOWN_PATCH_KEYS = new Set(["linkifyPass", "defaultExportFormat", "quotaTargets"]);

/**
 * Apply a partial PATCH /api/config body on top of the current config.
 * Unlike parseConfig (which is tolerant, for loading a possibly-stale file),
 * this is strict: unknown keys and invalid values are reported as errors
 * rather than silently dropped, since the caller is a live user request and
 * deserves to know what didn't take.
 *
 * `quotaTargets` in the patch REPLACES the whole quotaTargets override
 * (field-wise validated); `null` or `{}` clears the override entirely.
 *
 * Returns the current config unchanged (not partially applied) whenever
 * there are any errors — callers should treat a non-empty `errors` array as
 * "nothing was applied."
 */
export function applyConfigPatch(
  current: ScrychatConfig,
  patch: unknown
): { config: ScrychatConfig; errors: string[] } {
  const errors: string[] = [];

  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return { config: current, errors: ["patch must be a JSON object"] };
  }
  const src = patch as Record<string, unknown>;

  for (const key of Object.keys(src)) {
    if (!KNOWN_PATCH_KEYS.has(key)) {
      errors.push(`unknown field: ${key}`);
    }
  }

  const next: ScrychatConfig = { ...current };

  if ("linkifyPass" in src) {
    if (typeof src.linkifyPass === "boolean") {
      next.linkifyPass = src.linkifyPass;
    } else {
      errors.push("linkifyPass must be a boolean");
    }
  }

  if ("defaultExportFormat" in src) {
    if (isExportFormat(src.defaultExportFormat)) {
      next.defaultExportFormat = src.defaultExportFormat;
    } else {
      errors.push(`defaultExportFormat must be one of: ${EXPORT_FORMATS.join(", ")}`);
    }
  }

  if ("quotaTargets" in src) {
    const rawQuotaTargets = src.quotaTargets;
    if (rawQuotaTargets === null) {
      delete next.quotaTargets;
    } else if (typeof rawQuotaTargets === "object" && !Array.isArray(rawQuotaTargets)) {
      const candidate = rawQuotaTargets as Record<string, unknown>;
      const fieldErrors: string[] = [];
      const out: Partial<QuotaTargets> = {};
      for (const field of QUOTA_TARGET_FIELDS) {
        if (!(field in candidate)) continue;
        if (isValidTuple(candidate[field])) {
          out[field] = candidate[field] as [number, number];
        } else {
          fieldErrors.push(field);
        }
      }
      for (const key of Object.keys(candidate)) {
        if (!(QUOTA_TARGET_FIELDS as readonly string[]).includes(key)) {
          errors.push(`unknown quotaTargets field: ${key}`);
        }
      }
      if (fieldErrors.length > 0) {
        errors.push(
          `quotaTargets fields must be [min, max] tuples of finite numbers with min <= max: ${fieldErrors.join(", ")}`
        );
      }
      if (Object.keys(out).length > 0) {
        next.quotaTargets = out;
      } else {
        delete next.quotaTargets;
      }
    } else {
      errors.push("quotaTargets must be an object or null");
    }
  }

  if (errors.length > 0) {
    return { config: current, errors };
  }

  return { config: next, errors: [] };
}
