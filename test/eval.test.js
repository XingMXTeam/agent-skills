/**
 * Tests for the evaluator evaluation (eval/): case discovery and schema,
 * the staged-scoring core, the baseline differential, the smoke subset
 * end to end, and the directory-grep kernel fix the eval produced.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverCases,
  validateCaseDef,
  runCases,
  formatReport,
  scoreRubricIncident,
  scoreScanIncident,
  baselineFromResults,
  diffBaseline,
} from '../eval/lib.mjs';
import { runItem } from '../src/evaluate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVAL_ROOT = path.join(HERE, '..', 'eval');

test('eval set: 12 cases, tuning/test split, 8 incidents and 4 controls', () => {
  const cases = discoverCases(EVAL_ROOT);
  assert.equal(cases.length, 12);
  assert.equal(cases.filter((c) => c.set === 'tuning').length, 6);
  assert.equal(cases.filter((c) => c.set === 'test').length, 6);
  assert.equal(cases.filter((c) => c.def.kind === 'incident').length, 8);
  assert.equal(cases.filter((c) => c.def.kind === 'control').length, 4);
  const ids = new Set(cases.map((c) => c.def.id));
  assert.equal(ids.size, 12, 'case ids are unique');
});

test('eval set: the smoke subset is marked in the data and stays small', () => {
  const smoke = discoverCases(EVAL_ROOT).filter((c) => c.def.smoke === true);
  assert.equal(smoke.length, 5);
  assert.ok(smoke.some((c) => c.def.kind === 'control'), 'smoke includes a control');
  assert.ok(smoke.some((c) => c.def.kind === 'incident'), 'smoke includes incidents');
});

test('validateCaseDef rejects an incident without a one-sentence answer key', () => {
  assert.throws(
    () => validateCaseDef({ id: 'x', kind: 'incident', chain: 'rubric', title: 't', rubric: 'rubric.json', expect: { item: 'RB-1' } }),
    /answer key/,
  );
  assert.throws(() => validateCaseDef({ id: 'x', kind: 'incident', chain: 'nope', title: 't' }), /chain/);
});

test('validateCaseDef rejects an incident without a scenario; every shipped incident carries one', () => {
  assert.throws(
    () =>
      validateCaseDef({
        id: 'x',
        kind: 'incident',
        chain: 'rubric',
        title: 't',
        rubric: 'rubric.json',
        expect: { item: 'RB-1', why: 'w' },
      }),
    /scenario/,
    'a finding you cannot attach a scene to is not a finding',
  );
  for (const c of discoverCases(EVAL_ROOT)) {
    if (c.def.kind === 'incident') {
      assert.ok(typeof c.def.scenario === 'string' && c.def.scenario.length > 0, `${c.def.id} needs a scenario`);
    }
  }
  const smoke = discoverCases(EVAL_ROOT).filter((c) => c.def.smoke === true);
  const report = formatReport(runCases(smoke));
  assert.match(report, /Scenario: /, 'the scorecard prints each incident\'s trigger scene');
});

test('staged scoring: found by the item but not vetoed is a stage-2 leak', () => {
  const def = { chain: 'rubric', expect: { item: 'RB-9', why: 'w' } };
  const obs = {
    itemScores: new Map([['RB-9', 0]]),
    itemDetails: new Map([['RB-9', 'scan data=92 (min 95)']]),
    vetoReasons: new Map(),
    evaluation: { verdict: 'pass', score: 0.9, passScore: 0.9, verdictReason: 'score' },
  };
  const s = scoreRubricIncident(def, obs, null);
  assert.deepEqual([s.s1, s.s2, s.s3], [true, false, false]);
});

test('staged scoring: vetoed and failed is a full hit; untouched is a full miss', () => {
  const def = { chain: 'rubric', expect: { item: 'RB-1', why: 'w' } };
  const hit = scoreRubricIncident(
    def,
    {
      itemScores: new Map([['RB-1', 0]]),
      itemDetails: new Map([['RB-1', 'missing file']]),
      vetoReasons: new Map([['RB-1', 'essential item failed: missing file']]),
      evaluation: { verdict: 'fail', score: 0.4, passScore: 0.9, verdictReason: 'veto' },
    },
    null,
  );
  assert.deepEqual([hit.s1, hit.s2, hit.s3], [true, true, true]);
  const miss = scoreRubricIncident(
    def,
    {
      itemScores: new Map([['RB-1', 1]]),
      itemDetails: new Map([['RB-1', 'ok']]),
      vetoReasons: new Map(),
      evaluation: { verdict: 'pass', score: 1, passScore: 0.9, verdictReason: 'score' },
    },
    null,
  );
  assert.deepEqual([miss.s1, miss.s2, miss.s3], [false, false, false]);
});

test('staged scoring: a scan failure above the dimension threshold stops at stage 1', () => {
  const def = { chain: 'scan', expect: { dimension: 'data', check: 'hardcoded-secret', why: 'w' } };
  const obs = {
    failedChecks: [{ dim: 'data', check: 'hardcoded-secret', why: 'msg', evidence: 'src/a.ts:1' }],
    dimensions: { data: { score: 90, threshold: 85, passed: true } },
    gateForDimension: { data: { gate: 'dataReady', passed: true, detail: 'data 90 ≥ 85' } },
    report: { passed: true },
  };
  const s = scoreScanIncident(def, obs);
  assert.deepEqual([s.s1, s.s2, s.s3], [true, false, false]);
});

test('baseline differential: outcome flips and stage-only changes are separated', () => {
  const before = {
    version: 1,
    cases: {
      a: { outcome: 'blocked', stages: [true, true, true] },
      b: { outcome: 'blocked', stages: [true, true, true] },
      c: { outcome: 'clean', stages: null },
    },
  };
  const results = [
    { id: 'a', kind: 'incident', blocked: false, stages: { s1: true, s2: false, s3: false } },
    { id: 'b', kind: 'incident', blocked: true, stages: { s1: true, s2: true, s3: true } },
    { id: 'c', kind: 'control', falsePositive: false, noise: [] },
  ];
  const diff = diffBaseline(before, results);
  assert.equal(diff.flips.length, 1);
  assert.equal(diff.flips[0].id, 'a');
  assert.equal(diff.flips[0].regression, true, 'an incident going blocked → passed is a regression');
  const roundtrip = diffBaseline(baselineFromResults(results), results);
  assert.equal(roundtrip.flips.length, 0);
  assert.equal(roundtrip.stageChanges.length, 0);
});

test('grep scoped to a directory recurses into nested files (kernel fix from the eval)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'harness-grep-'));
  try {
    mkdirSync(path.join(dir, 'src', 'deep'), { recursive: true });
    writeFileSync(path.join(dir, 'src', 'deep', 'widget.js'), 'el.innerHTML = userText;\n');
    writeFileSync(path.join(dir, 'src', 'clean.js'), 'export const x = 1;\n');
    const hit = runItem(dir, { kind: 'grep', path: 'src', pattern: 'innerHTML\\s*=', expect: 'absent' }, 5000);
    assert.equal(hit.score, 0, 'a pitfall pattern in a nested file must be found');
    assert.match(hit.detail, /widget\.js/);
    const miss = runItem(dir, { kind: 'grep', path: 'src', pattern: 'dangerouslySetInnerHTML', expect: 'absent' }, 5000);
    assert.equal(miss.score, 1, 'an absent pattern in a directory still passes');
    const present = runItem(dir, { kind: 'grep', path: 'src', pattern: 'innerHTML', expect: 'present' }, 5000);
    assert.equal(present.score, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('smoke subset runs green end to end (the npm test smoke layer)', () => {
  const smoke = discoverCases(EVAL_ROOT).filter((c) => c.def.smoke === true);
  const results = runCases(smoke);
  for (const r of results) {
    if (r.kind === 'incident') assert.equal(r.blocked, true, `${r.id} must be blocked: ${r.detail.join(' | ')}`);
    else assert.equal(r.falsePositive, false, `${r.id} must pass clean: ${r.noise.join(' | ')}`);
  }
});
