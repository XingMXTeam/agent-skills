/**
 * Property-based tests for the kernel's invariants.
 *
 * No new dependencies: a seeded PRNG (mulberry32) generates the cases, so
 * every run is reproducible — a failure prints the seed and the smallest
 * counterexample the shrinker could find, and replaying that seed
 * regenerates the exact same case stream.
 *
 * The invariants are the load-bearing claims of the design (SPEC
 * decisions 4–5 and the SHA discipline of the task protocol):
 *   1. Veto: a failed essential or a triggered pitfall fails the verdict
 *      no matter what else scores.
 *   2. SHA: a mutated commit SHA never verifies.
 *   3. Monotonicity: appending a failure to a pass makes it fail;
 *      appending passes to a vetoed rubric never rescues it.
 *   4. Determinism: the same rubric over the same workspace evaluates to
 *      the identical result, every time.
 *   5. Coverage gate: a requirement is reported as a gap if and only if
 *      it has no essential item.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateRubric } from '../src/evaluate.js';
import { validateRubric, coverageGaps } from '../src/rubric.js';
import { verifySha } from '../src/git.js';
import { DEFAULT_CONFIG } from '../src/config.js';

const SEED = 20261119;
const SAMPLES = 200;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let ws;
before(() => {
  ws = mkdtempSync(path.join(tmpdir(), 'harness-prop-'));
  writeFileSync(path.join(ws, 'good.txt'), 'real implementation\n');
  writeFileSync(path.join(ws, 'a.txt'), 'alpha\n');
  writeFileSync(path.join(ws, 'b.txt'), 'beta\n');
});
after(() => rmSync(ws, { recursive: true, force: true }));

const CONFIG = structuredClone(DEFAULT_CONFIG);
const PASSING_FILES = ['good.txt', 'a.txt', 'b.txt'];
const WEIGHTS = [0.3, 0.7, 1, 2, 5];
const LEVELS = ['essential', 'important', 'optional'];

function makeRng() {
  const next = mulberry32(SEED);
  return {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

function passingItem(rng, id) {
  const kind = rng.pick(['file', 'grep']);
  const base = { id, requirement: 'REQ-1', level: rng.pick(LEVELS), weight: rng.pick(WEIGHTS) };
  if (kind === 'file') return { ...base, kind, path: rng.pick(PASSING_FILES) };
  return { ...base, kind, path: 'good.txt', pattern: 'real implementation', expect: 'present' };
}

function failingEssential(id) {
  return { id, requirement: 'REQ-1', level: 'essential', weight: 1, kind: 'file', path: `missing-${id}.txt` };
}

function triggeredPitfall(id) {
  return { id, requirement: 'REQ-1', level: 'pitfall', weight: 1, kind: 'grep', path: 'good.txt', pattern: 'real implementation', expect: 'absent' };
}

function evaluate(items) {
  const rubric = { version: 1, feature: 'prop', requirements: [{ id: 'REQ-1', description: 'property fixture' }], items };
  validateRubric(rubric);
  return evaluateRubric(ws, rubric, CONFIG);
}

/** Greedy shrink: drop passing items while the predicate still holds. */
function shrink(items, fixed, pred) {
  let current = [...items];
  for (const item of items) {
    const candidate = current.filter((i) => i !== item);
    if (pred([...fixed, ...candidate])) current = candidate;
  }
  return [...fixed, ...current];
}

test('property: a veto source fails the verdict regardless of everything else (200 samples)', () => {
  const rng = makeRng();
  for (let s = 0; s < SAMPLES; s += 1) {
    const veto = s % 2 === 0 ? failingEssential('VETO') : triggeredPitfall('VETO');
    const others = Array.from({ length: rng.int(9) }, (_, i) => passingItem(rng, `P${i}`));
    const result = evaluate([veto, ...others]);
    if (result.verdict !== 'fail' || result.verdictReason !== 'veto') {
      const minimal = shrink(others, [veto], (items) => evaluate(items).verdict !== 'fail');
      assert.fail(`seed ${SEED} sample ${s}: veto did not fail the verdict; minimal counterexample: ${JSON.stringify(minimal)}`);
    }
  }
});

test('property: a mutated commit SHA never verifies (200 samples)', () => {
  const rng = makeRng();
  const root = REPO_ROOT;
  const head = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(verifySha(root, head), true, 'control: the real HEAD sha verifies');
  const HEX = '0123456789abcdef';
  for (let s = 0; s < SAMPLES; s += 1) {
    let mutated;
    if (s % 2 === 0) {
      // Hex mutation of the real SHA: same shape, different commit — must not resolve.
      const pos = rng.int(40);
      let ch = HEX[rng.int(16)];
      if (ch === head[pos]) ch = HEX[(HEX.indexOf(ch) + 1) % 16];
      mutated = head.slice(0, pos) + ch + head.slice(pos + 1);
    } else {
      // Shape-breaking mutations: wrong alphabet or wrong length.
      mutated = rng.pick([`${head}g`, head.slice(0, 5), `${head}a`, 'zzzzzzz', head.replace(/[0-9a-f]/, 'x')]);
    }
    assert.equal(verifySha(root, mutated), false, `seed ${SEED} sample ${s}: mutated sha ${mutated} must not verify`);
  }
});

test('property: monotonicity — appending a failure breaks a pass; appending passes never rescues a veto (200 samples)', () => {
  const rng = makeRng();
  for (let s = 0; s < SAMPLES; s += 1) {
    const base = Array.from({ length: 1 + rng.int(8) }, (_, i) => passingItem(rng, `P${i}`));
    const passing = evaluate(base);
    assert.equal(passing.verdict, 'pass', `seed ${SEED} sample ${s}: all-passing rubric must pass`);
    const broken = evaluate([...base, failingEssential('LATE')]);
    if (broken.verdict !== 'fail') {
      const minimal = shrink(base, [failingEssential('LATE')], (items) => evaluate(items).verdict !== 'fail');
      assert.fail(`seed ${SEED} sample ${s}: appending a failing essential did not break the pass; minimal counterexample: ${JSON.stringify(minimal)}`);
    }
    const rescued = evaluate([failingEssential('VETO'), ...base, ...Array.from({ length: rng.int(5) }, (_, i) => passingItem(rng, `Q${i}`))]);
    assert.equal(rescued.verdict, 'fail', `seed ${SEED} sample ${s}: extra passes must never rescue a veto`);
  }
});

test('property: determinism — the same input evaluates identically twice (200 samples)', () => {
  const rng = makeRng();
  for (let s = 0; s < SAMPLES; s += 1) {
    const items = Array.from({ length: rng.int(9) }, (_, i) => {
      const roll = rng.next();
      if (roll < 0.55) return passingItem(rng, `I${i}`);
      if (roll < 0.8) return { id: `I${i}`, requirement: 'REQ-1', level: rng.pick(LEVELS), weight: rng.pick(WEIGHTS), kind: 'file', path: `missing-${i}.txt` };
      return triggeredPitfall(`I${i}`);
    });
    if (items.length === 0) items.push(passingItem(rng, 'I0'));
    const a = evaluate(items);
    const b = evaluate(items);
    const strip = ({ at, ...rest }) => rest;
    assert.deepEqual(strip(b), strip(a), `seed ${SEED} sample ${s}: repeated evaluation diverged`);
  }
});

test('property: coverage gate reports a requirement iff it has no essential item (200 samples)', () => {
  const rng = makeRng();
  for (let s = 0; s < SAMPLES; s += 1) {
    const n = 1 + rng.int(5);
    const requirements = [];
    const items = [];
    const expected = new Set();
    for (let r = 0; r < n; r += 1) {
      const req = `REQ-${r + 1}`;
      requirements.push({ id: req, description: `requirement ${r + 1}` });
      const coverage = rng.pick(['essential', 'important-only', 'none']);
      if (coverage === 'essential') {
        items.push({ id: `E${r}`, requirement: req, level: 'essential', kind: 'file', path: 'good.txt' });
      } else {
        if (coverage === 'important-only') {
          items.push({ id: `I${r}`, requirement: req, level: 'important', kind: 'file', path: 'good.txt' });
        }
        expected.add(req);
      }
    }
    const gaps = new Set(coverageGaps({ requirements, items }).map((g) => g.requirement));
    assert.deepEqual(gaps, expected, `seed ${SEED} sample ${s}: gap set must equal the requirements without an essential item`);
  }
});
