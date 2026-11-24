/**
 * Tests for the review layer (v0.12): three-state verdicts, the review
 * package/report protocol with SHA binding, the review phase routing,
 * the reviewer role's isolation, and the v1 -> v2 state migration.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { evaluateRubric } from '../src/evaluate.js';
import { validateRubric, coverageGaps } from '../src/rubric.js';
import { createState, loadState, saveState, statePath } from '../src/state.js';
import { applyEvaluation, nextAction } from '../src/orchestrate.js';
import { buildRolePacket, reviewerLeaks, roleFor } from '../src/roles.js';
import { buildReviewPackage, writeReviewPackage, validateReviewReport, mergeReview, sha256File } from '../src/review.js';
import { DEFAULT_CONFIG } from '../src/config.js';

const CONFIG = structuredClone(DEFAULT_CONFIG);

let ws;
before(() => {
  ws = mkdtempSync(path.join(tmpdir(), 'harness-review-'));
  writeFileSync(path.join(ws, 'app.txt'), 'the app, version 1\n');
});
after(() => rmSync(ws, { recursive: true, force: true }));

const STATIC_OK = { id: 'RB-1', requirement: 'REQ-1', level: 'essential', kind: 'file', path: 'app.txt' };
const INTERACTIVE = {
  id: 'RB-2', requirement: 'REQ-1', level: 'important', kind: 'judge', anchor: 'REF-1',
  evidence: '.harness/tasks/x/evaluation/judge-rb-2.json', path: 'app.txt',
  verify: 'interactive',
  assert: { steps: ['focus the input', 'type "hello"'], expect: 'the typed text appears in the display' },
};

function rubricOf(items) {
  const rubric = { version: 1, feature: 'review-test', requirements: [{ id: 'REQ-1', description: 'the app works' }], items };
  validateRubric(rubric);
  return rubric;
}

// ─── rubric schema: the verify field ────────────────────────────────────────

test('rubric: verify=interactive without an executable assert is rejected at validation', () => {
  const base = { version: 1, requirements: [{ id: 'REQ-1' }], items: [] };
  const item = { id: 'X', requirement: 'REQ-1', level: 'important', kind: 'judge', anchor: 'REF-1', evidence: 'e.json', verify: 'interactive' };
  assert.throws(() => validateRubric({ ...base, items: [item] }), /assert\.steps/);
  assert.throws(() => validateRubric({ ...base, items: [{ ...item, assert: { steps: ['do it'] } }] }), /assert\.expect/);
  assert.throws(() => validateRubric({ ...base, items: [{ ...item, assert: { steps: [], expect: 'x' } }] }), /assert\.steps/);
  assert.doesNotThrow(() => validateRubric({ ...base, items: [{ ...item, assert: { steps: ['do it'], expect: 'it is done' } }] }));
});

test('rubric: an unknown verify mode is rejected; absent verify stays static', () => {
  const base = { version: 1, requirements: [{ id: 'REQ-1' }], items: [] };
  assert.throws(
    () => validateRubric({ ...base, items: [{ id: 'X', requirement: 'REQ-1', level: 'important', kind: 'file', path: 'a.txt', verify: 'vibes' }] }),
    /verify must be one of/,
  );
  assert.doesNotThrow(() => validateRubric({ ...base, items: [{ id: 'X', requirement: 'REQ-1', level: 'important', kind: 'file', path: 'a.txt' }] }));
});

test('coverage: an interactive item without an assert is a coverage gap even unvalidated', () => {
  const gaps = coverageGaps({
    requirements: [{ id: 'REQ-1' }],
    items: [
      { id: 'RB-1', requirement: 'REQ-1', level: 'essential', kind: 'file', path: 'app.txt' },
      { id: 'RB-2', requirement: 'REQ-1', level: 'important', kind: 'judge', verify: 'interactive' },
    ],
  });
  assert.ok(gaps.some((g) => /RB-2/.test(g.problem) && /assert/.test(g.problem)), JSON.stringify(gaps));
});

// ─── three-state verdicts ───────────────────────────────────────────────────

test('three-state: a judge item with no evidence is unverified, not failed — verdict incomplete', () => {
  const rubric = rubricOf([
    STATIC_OK,
    { id: 'RB-3', requirement: 'REQ-1', level: 'important', kind: 'judge', anchor: 'REF-1', evidence: 'no-such-evidence.json' },
  ]);
  const ev = evaluateRubric(ws, rubric, CONFIG);
  const rb3 = ev.results.find((r) => r.id === 'RB-3');
  assert.equal(rb3.status, 'unverified');
  assert.equal(rb3.score, null, 'unverified items carry no score');
  assert.equal(ev.verdict, 'incomplete');
  assert.equal(ev.verdictReason, 'unverified');
  assert.deepEqual(ev.unverified, ['RB-3']);
  assert.equal(ev.score, 1, 'the verified part still scores on its own denominator');
});

test('three-state: stale judge evidence is unverified too', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'harness-review-stale-'));
  try {
    writeFileSync(path.join(dir, 'app.txt'), 'x\n');
    writeFileSync(path.join(dir, 'ev.json'), JSON.stringify({ score: 1, note: 'old' }));
    const rubric = rubricOf([
      { id: 'RB-1', requirement: 'REQ-1', level: 'essential', kind: 'file', path: 'app.txt' },
      { id: 'RB-3', requirement: 'REQ-1', level: 'important', kind: 'judge', anchor: 'REF-1', evidence: 'ev.json' },
    ]);
    const ev = evaluateRubric(dir, rubric, CONFIG, { freshSince: Date.now() + 60_000, freshReason: 'test' });
    assert.equal(ev.results.find((r) => r.id === 'RB-3').status, 'unverified');
    assert.equal(ev.verdict, 'incomplete');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('three-state: an interactive item is never decided by the static pass', () => {
  const ev = evaluateRubric(ws, rubricOf([STATIC_OK, INTERACTIVE]), CONFIG);
  const rb2 = ev.results.find((r) => r.id === 'RB-2');
  assert.equal(rb2.status, 'unverified');
  assert.equal(rb2.verify, 'interactive');
  assert.equal(ev.verdict, 'incomplete');
});

test('veto: an unverified essential item fails the verdict, fail-closed, reason unverified', () => {
  const ev = evaluateRubric(ws, rubricOf([STATIC_OK, { ...INTERACTIVE, id: 'RB-9', level: 'essential' }]), CONFIG);
  assert.equal(ev.verdict, 'fail');
  assert.equal(ev.verdictReason, 'veto');
  const veto = ev.vetoed.find((v) => v.id === 'RB-9');
  assert.ok(veto, 'the unverified essential item is in the veto list');
  assert.equal(veto.reason, 'unverified');
});

test('veto: an unverified pitfall item fails closed too', () => {
  const ev = evaluateRubric(ws, rubricOf([STATIC_OK, { ...INTERACTIVE, id: 'RB-8', level: 'pitfall' }]), CONFIG);
  assert.equal(ev.verdict, 'fail');
  assert.equal(ev.vetoed.find((v) => v.id === 'RB-8')?.reason, 'unverified');
});

test('denominator: appending an unverified item to a passing rubric keeps the score, changes the verdict', () => {
  const before = evaluateRubric(ws, rubricOf([STATIC_OK]), CONFIG);
  assert.equal(before.verdict, 'pass');
  assert.equal(before.score, 1);
  const after = evaluateRubric(ws, rubricOf([STATIC_OK, INTERACTIVE]), CONFIG);
  assert.equal(after.score, before.score, 'unverified items are excluded from the denominator');
  assert.equal(after.verdict, 'incomplete');
});

// ─── routing: incomplete never becomes developer homework ───────────────────

function freshState() {
  const s = createState('review-test');
  s.phase = 'implement';
  s.clarificationComplete = true;
  s.macroCycle.max = 5;
  return s;
}

test('routing: incomplete with an interactive item goes to the review phase, not remediation', () => {
  const ev = evaluateRubric(ws, rubricOf([STATIC_OK, INTERACTIVE]), CONFIG);
  const state = freshState();
  const routing = applyEvaluation(ws, state, CONFIG, ev, { passed: true, steps: [] });
  assert.equal(routing.routed, 'review');
  assert.equal(state.phase, 'review');
  assert.deepEqual(state.remediation, [], 'unverified items are not remediation items');
  assert.deepEqual(state.lastReview.pending, ['RB-2']);
  const next = nextAction(ws, state, CONFIG);
  assert.equal(next.action, 'review');
  assert.deepEqual(next.items, ['RB-2']);
});

test('routing: incomplete with only judge evidence routes back to the evaluator', () => {
  const rubric = rubricOf([
    STATIC_OK,
    { id: 'RB-3', requirement: 'REQ-1', level: 'important', kind: 'judge', anchor: 'REF-1', evidence: 'no-such-evidence.json' },
  ]);
  const ev = evaluateRubric(ws, rubric, CONFIG);
  const state = freshState();
  const routing = applyEvaluation(ws, state, CONFIG, ev, { passed: true, steps: [] });
  assert.equal(routing.routed, 're-evaluate');
  assert.notEqual(state.phase, 'review');
  assert.deepEqual(state.remediation, []);
  assert.equal(state.macroCycle.current, 1, 'an incomplete evaluation burns no macro cycle');
});

test('routing: a vetoed-by-unverified verdict also goes to review, not remediation', () => {
  const ev = evaluateRubric(ws, rubricOf([STATIC_OK, { ...INTERACTIVE, id: 'RB-9', level: 'essential' }]), CONFIG);
  assert.equal(ev.verdict, 'fail');
  const state = freshState();
  const routing = applyEvaluation(ws, state, CONFIG, ev, { passed: true, steps: [] });
  assert.equal(routing.routed, 'review', 'the fail is "not yet verified", and only a review can settle it');
  assert.equal(state.phase, 'review');
  assert.deepEqual(state.remediation, []);
});

// ─── state migration ────────────────────────────────────────────────────────

test('state: v1 state files migrate to v2 on load; new states are v2 with lastReview', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-review-state-'));
  try {
    const v1 = { version: 1, feature: 'legacy', phase: 'implement', tasks: [], history: [], macroCycle: { current: 1, max: 5 }, consecutivePasses: 0 };
    const file = statePath(root, 'legacy');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(v1));
    const loaded = loadState(root, 'legacy');
    assert.equal(loaded.version, 2);
    assert.equal(loaded.lastReview, null);
    assert.equal(loaded.phase, 'implement', 'migration changes nothing else');
    const fresh = createState('brand-new');
    assert.equal(fresh.version, 2);
    assert.equal(fresh.lastReview, null);
    saveState(root, fresh);
    assert.equal(JSON.parse(readFileSync(statePath(root, 'brand-new'), 'utf8')).version, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ─── the review package and report validation ───────────────────────────────

function packageFor(items = [STATIC_OK, INTERACTIVE]) {
  const rubric = rubricOf(items);
  const ev = evaluateRubric(ws, rubric, CONFIG);
  return { rubric, pkg: buildReviewPackage(ws, 'review-test', rubric, ev) };
}

test('package: contains the pending interactive items with assertions and target hashes', () => {
  const { pkg } = packageFor();
  assert.equal(pkg.items.length, 1);
  const [item] = pkg.items;
  assert.equal(item.id, 'RB-2');
  assert.equal(item.verify, 'interactive');
  assert.deepEqual(item.assert.steps, ['focus the input', 'type "hello"']);
  assert.equal(item.targets.length, 1);
  assert.equal(item.targets[0].path, 'app.txt');
  assert.equal(item.targets[0].sha256, sha256File(path.join(ws, 'app.txt')));
});

test('package: unverified judge items are not review work', () => {
  const { pkg } = packageFor([
    STATIC_OK,
    { id: 'RB-3', requirement: 'REQ-1', level: 'important', kind: 'judge', anchor: 'REF-1', evidence: 'no-such-evidence.json' },
  ]);
  assert.equal(pkg.items.length, 0);
});

function validReport(wsRoot, pkg, overrides = {}) {
  const target = pkg.items[0].targets[0];
  return {
    results: [{
      id: pkg.items[0].id,
      score: 1,
      note: 'typed text appeared in the display',
      artifacts: [target.path, 'review-trace.txt'],
      artifactSha: { [target.path]: sha256File(path.join(wsRoot, target.path)) },
      ...overrides,
    }],
  };
}

test('merge: a valid report resolves the item and the merged verdict passes', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-review-merge-'));
  try {
    writeFileSync(path.join(root, 'app.txt'), 'the app, version 1\n');
    writeFileSync(path.join(root, 'review-trace.txt'), 'trace: focus -> type -> display updated\n');
    const rubric = rubricOf([STATIC_OK, INTERACTIVE]);
    const ev = evaluateRubric(root, rubric, CONFIG);
    assert.equal(ev.verdict, 'incomplete');
    const pkg = buildReviewPackage(root, 'review-test', rubric, ev);
    writeReviewPackage(root, 'review-test', pkg);
    const reportFile = path.join(root, '.harness', 'tasks', 'review-test', 'review', 'report.json');
    mkdirSync(path.dirname(reportFile), { recursive: true });
    writeFileSync(reportFile, JSON.stringify(validReport(root, pkg)));
    const { evaluation, accepted, problems } = mergeReview(root, 'review-test', rubric, CONFIG);
    assert.deepEqual(accepted, ['RB-2']);
    assert.deepEqual(problems, []);
    assert.equal(evaluation.results.find((r) => r.id === 'RB-2').status, 'pass');
    assert.equal(evaluation.verdict, 'pass');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('merge: tampering with the artifact after review sends the item back to unverified', () => {
  const { rubric, pkg } = packageFor();
  writeFileSync(path.join(ws, 'review-trace.txt'), 'trace\n');
  const report = validReport(ws, pkg);
  const ok = validateReviewReport(ws, rubric, pkg, report, { reportAt: Date.now() });
  assert.deepEqual(ok.accepted, ['RB-2']);
  const original = readFileSync(path.join(ws, 'app.txt'), 'utf8');
  writeFileSync(path.join(ws, 'app.txt'), 'tampered bytes\n');
  try {
    const after = validateReviewReport(ws, rubric, pkg, report, { reportAt: Date.now() });
    assert.deepEqual(after.accepted, []);
    assert.match(after.problems.find((p) => p.id === 'RB-2').reason, /SHA mismatch/);
  } finally {
    writeFileSync(path.join(ws, 'app.txt'), original);
  }
});

test('merge: a report citing a missing evidence file is rejected', () => {
  const { rubric, pkg } = packageFor();
  const report = validReport(ws, pkg, { artifacts: ['app.txt', 'ghost-trace.txt'] });
  const v = validateReviewReport(ws, rubric, pkg, report, { reportAt: Date.now() });
  assert.deepEqual(v.accepted, []);
  assert.match(v.problems[0].reason, /missing artifact/);
});

test('merge: a stale report (older than its package) is rejected', () => {
  const { rubric, pkg } = packageFor();
  writeFileSync(path.join(ws, 'review-trace.txt'), 'trace\n');
  const v = validateReviewReport(ws, rubric, pkg, validReport(ws, pkg), { reportAt: pkg.generatedAt - 1000 });
  assert.deepEqual(v.accepted, []);
  assert.match(v.problems[0].reason, /stale review report/);
});

test('merge: a fake PNG cited as evidence is rejected', () => {
  const { rubric, pkg } = packageFor();
  writeFileSync(path.join(ws, 'shot.png'), 'not a png at all');
  const report = validReport(ws, pkg, { artifacts: ['app.txt', 'shot.png'] });
  const v = validateReviewReport(ws, rubric, pkg, report, { reportAt: Date.now() });
  assert.deepEqual(v.accepted, []);
  assert.match(v.problems[0].reason, /not real PNGs/);
});

test('merge: human items accept only a human attestation with a note', () => {
  const human = { id: 'RB-5', requirement: 'REQ-1', level: 'important', kind: 'judge', anchor: 'REF-1', evidence: 'e.json', verify: 'human' };
  const { rubric, pkg } = packageFor([STATIC_OK, human]);
  assert.equal(pkg.items.length, 1);
  const agentTry = { results: [{ id: 'RB-5', score: 1, note: 'sounds fine to me' }] };
  const v1 = validateReviewReport(ws, rubric, pkg, agentTry, { reportAt: Date.now() });
  assert.deepEqual(v1.accepted, []);
  assert.match(v1.problems[0].reason, /confirmedBy/);
  const humanTry = { results: [{ id: 'RB-5', score: 1, note: 'listened on two devices; the chime is pleasant, not shrill', confirmedBy: 'human' }] };
  const v2 = validateReviewReport(ws, rubric, pkg, humanTry, { reportAt: Date.now() });
  assert.deepEqual(v2.accepted, ['RB-5']);
});

// ─── reviewer role: packet shape and isolation ──────────────────────────────

test('reviewer: the role exists, maps from the review action, and its packet is isolated', () => {
  assert.equal(roleFor('review'), 'reviewer');
  const root = mkdtempSync(path.join(tmpdir(), 'harness-review-role-'));
  try {
    writeFileSync(path.join(root, 'app.txt'), 'the app\n');
    const fdir = path.join(root, '.harness', 'tasks', 'feat');
    mkdirSync(path.join(fdir, 'developer'), { recursive: true });
    writeFileSync(path.join(fdir, 'developer', 'task-1-report.md'), 'implemented by trying really hard');
    const state = createState('feat');
    state.phase = 'review';
    state.tasks = [{ id: 'TASK-1', title: 'secret plan', requirements: ['REQ-1'], status: 'done', attempts: 1, commitSha: 'deadbeefcafe1234' }];
    state.lastReview = { at: Date.now(), verdict: 'incomplete', pending: ['RB-2'], packageAt: null };
    const rubric = rubricOf([STATIC_OK, INTERACTIVE]);
    const packet = buildRolePacket(root, state, { action: 'review', phase: 'review', instruction: 'review it' }, { rubric });
    assert.equal(packet.role, 'reviewer');
    assert.deepEqual(packet.reviewItems.map((i) => i.id), ['RB-2']);
    assert.deepEqual(packet.reviewItems[0].assert.steps, ['focus the input', 'type "hello"']);
    assert.deepEqual(reviewerLeaks(root, state, packet), [], 'no implementer record may reach the reviewer');
    const text = JSON.stringify(packet);
    assert.ok(!text.includes('deadbeefcafe1234'), 'commit SHA must not appear');
    assert.ok(!text.includes('task-1-report.md'), 'developer reports must not appear');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('review phase is in the phase list between evaluate and verify', async () => {
  const { PHASES } = await import('../src/state.js');
  assert.deepEqual(PHASES, ['clarify', 'implement', 'evaluate', 'review', 'verify', 'done', 'paused']);
});
