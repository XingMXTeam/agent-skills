#!/usr/bin/env node
/**
 * Run the evaluator evaluation (see eval/lib.mjs and
 * docs/evaluator-evaluation.md).
 *
 * Usage:
 *   node eval/run-eval.mjs [--set tuning|test] [--smoke]
 *                          [--update-baseline]
 *
 * Full runs write eval/last-report.md and diff against eval/baseline.json.
 * The baseline is only ever rewritten by an explicit --update-baseline —
 * a drifting baseline would make the differential layer meaningless.
 * Filtered runs (--set / --smoke) print to stdout only.
 *
 * Exit code 1 when a non-declared incident leaks past the final verdict,
 * a clean control is falsely blocked, or the baseline diff regresses.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverCases, runCases, formatReport, diffBaseline, baselineFromResults, runFailed } from './lib.mjs';

const EVAL_ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_FILE = path.join(EVAL_ROOT, 'baseline.json');
const REPORT_FILE = path.join(EVAL_ROOT, 'last-report.md');

const args = process.argv.slice(2);
const setArg = args.find((a) => a.startsWith('--set='))?.split('=')[1] ?? (args.includes('--set') ? args[args.indexOf('--set') + 1] : null);
const smokeOnly = args.includes('--smoke');
const updateBaseline = args.includes('--update-baseline');
const filtered = Boolean(setArg || smokeOnly);

let cases = discoverCases(EVAL_ROOT);
if (setArg) cases = cases.filter((c) => c.set === setArg);
if (smokeOnly) cases = cases.filter((c) => c.def.smoke === true);
if (cases.length === 0) {
  console.error('no eval cases matched the given filters');
  process.exit(2);
}

const results = runCases(cases);

let baselineDiff = null;
let baselineNote = null;
if (updateBaseline) {
  if (filtered) {
    console.error('--update-baseline requires a full run (no --set / --smoke filters)');
    process.exit(2);
  }
  writeFileSync(BASELINE_FILE, `${JSON.stringify(baselineFromResults(results), null, 2)}\n`);
  baselineNote = `Baseline updated by explicit --update-baseline: ${results.length} case outcomes recorded in eval/baseline.json.`;
} else if (!filtered && existsSync(BASELINE_FILE)) {
  baselineDiff = diffBaseline(JSON.parse(readFileSync(BASELINE_FILE, 'utf8')), results);
} else if (!filtered) {
  baselineNote = 'No baseline yet — run `npm run eval -- --update-baseline` once to record one.';
}

const report = formatReport(results, { baselineDiff, baselineNote });
console.log(report);
if (!filtered) writeFileSync(REPORT_FILE, report);
if (updateBaseline) console.log(`\nbaseline written to ${BASELINE_FILE}`);
process.exit(runFailed(results, baselineDiff) ? 1 : 0);
