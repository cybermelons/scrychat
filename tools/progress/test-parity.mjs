#!/usr/bin/env node
/**
 * --check-parity must actually open the artifact.
 *
 * The failure this guards is specific: a parity report that always prints
 * "0 unproven" is indistinguishable from a repo with full parity, and it is
 * the more likely of the two. So the test does not assert the check exists
 * or that the current repo passes -- it breaks a hint in a COPY of
 * issues.json and requires the check to notice.
 *
 * Three defects, because they fail through different branches: a literal
 * that is absent from a real file, a path that matches no file, and a
 * record with no hint at all (which must be reported, not silently passed).
 *
 * Never mutates the real issues.json: each case runs build.py against a
 * temp copy via --data.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = join(HERE, "build.py");
const REAL = join(HERE, "issues.json");

const tmp = mkdtempSync(join(tmpdir(), "parity-"));
let failures = 0;

function run(data) {
  const p = join(tmp, "issues.json");
  writeFileSync(p, JSON.stringify(data));
  // execFileSync throws on nonzero; the report always exits 0, so a throw
  // here is itself a finding.
  return execFileSync("python3", [BUILD, "--check-parity", "--data", p], {
    encoding: "utf8",
  });
}

function check(name, cond, detail) {
  if (cond) {
    console.log(`ok   ${name}`);
  } else {
    console.log(`FAIL ${name}: ${detail}`);
    failures++;
  }
}

const base = JSON.parse(readFileSync(REAL, "utf8"));

// Baseline: the real data must parse and report every record.
const clean = run(base);
check(
  "reports every record",
  clean.includes(`of ${base.issues.length} pins`),
  `did not account for all ${base.issues.length} pins:\n${clean}`,
);
check(
  "no record is left unhinted",
  / 0 with no `proves` hint/.test(clean),
  `a record has no proves hint, so parity cannot be read for it:\n${clean}`,
);

// Defect 1: a literal that is not in a file that does exist.
const d1 = structuredClone(base);
const target = d1.issues.find((i) => i.proves?.length);
target.proves = [{ file: target.proves[0].file, has: "zzz-not-in-any-source" }];
check(
  "detects a literal absent from a real file",
  run(d1).includes("UNPROVEN") &&
    run(d1).includes("zzz-not-in-any-source"),
  "a broken literal did not produce an UNPROVEN line",
);

// Defect 2: a path matching no file. Distinct branch from defect 1 -- an
// unreadable path must not read as an empty source that trivially matches.
const d2 = structuredClone(base);
const t2 = d2.issues.find((i) => i.proves?.length);
t2.proves = [{ file: "apps/web/ui/src/NoSuchFile.tsx", has: "anything" }];
check(
  "detects a path that matches no file",
  run(d2).includes("no file matches that path"),
  "a nonexistent path was not reported",
);

// Defect 3: no hint at all must be reported, not passed.
const d3 = structuredClone(base);
delete d3.issues.find((i) => i.proves?.length).proves;
const out3 = run(d3);
check(
  "reports a record with no hint",
  out3.includes("NO-HINT") && /1 with no `proves` hint/.test(out3),
  `an unhinted record was not counted:\n${out3}`,
);

rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `\n${failures} failure(s)` : "\nall parity checks pass");
process.exit(failures ? 1 : 0);
