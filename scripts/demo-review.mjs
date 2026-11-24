/**
 * End-to-end demo of the v0.12.0 review layer, driven through the
 * kernel's own API (no CLI, no model):
 *
 *   1. a feature with one static item + one interactive item is evaluated
 *      → the interactive item is unverified, the verdict is incomplete;
 *   2. the evaluation routes to the review phase and a review package
 *      is built (assertions + target SHA-256 frozen);
 *   3. a review report with real evidence and the correct SHA merges
 *      → the verdict becomes pass;
 *   4. the artifact is then modified and the same report is merged
 *      again → the entry is rejected (SHA mismatch) and the item falls
 *      back to unverified.
 *
 * Run: node scripts/demo-review.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG, featureDir } from '../src/config.js';
import { evaluateRubric } from '../src/evaluate.js';
import { applyEvaluation } from '../src/orchestrate.js';
import { buildReviewPackage, writeReviewPackage, mergeReview, sha256File, reviewDir } from '../src/review.js';
import { createState, saveState } from '../src/state.js';

const log = (...args) => console.log(...args);
const root = mkdtempSync(path.join(tmpdir(), 'harness-demo-review-'));
const FEATURE = 'demo';
const config = structuredClone(DEFAULT_CONFIG);

log('== demo workspace:', root);

// --- fixture: one deliverable, a rubric with a static + an interactive item
writeFileSync(path.join(root, 'app.txt'), 'the deliverable under review\n');
const rubric = {
  version: 1,
  feature: FEATURE,
  requirements: [{ id: 'REQ-1', description: 'the deliverable works end to end' }],
  items: [
    { id: 'RB-1', requirement: 'REQ-1', level: 'essential', kind: 'file', path: 'app.txt', minBytes: 5, weight: 2, description: 'deliverable exists' },
    {
      id: 'RB-2', requirement: 'REQ-1', level: 'important', kind: 'judge', anchor: 'REF-1', weight: 2,
      evidence: '.harness/tasks/demo/evaluation/judge-rb-2.json', path: 'app.txt', verify: 'interactive',
      description: 'Enter submits the form',
      assert: { steps: ['open the app', 'type an amount', 'press Enter'], expect: 'focus moves to the confirm button and the amount persists' },
    },
  ],
};
mkdirSync(featureDir(root, FEATURE), { recursive: true });
writeFileSync(path.join(featureDir(root, FEATURE), 'rubric.json'), JSON.stringify(rubric, null, 2));
const state = createState(root, FEATURE, config);
saveState(root, state);

// --- step 1: static evaluation — the interactive item cannot be decided
const first = evaluateRubric(root, rubric, config);
log('\n== step 1: harness eval (static pass)');
for (const r of first.results) log(`   ${r.id}: status=${r.status} score=${r.score} — ${r.detail}`);
log(`   verdict=${first.verdict} (score ${first.score} over verified items only), unverified=[${first.unverified.join(', ')}]`);

// --- step 2: routing — incomplete goes to review, not remediation
const routing = applyEvaluation(root, state, rubric, first, config, null);
log('\n== step 2: routing');
log(`   routed=${routing.routed}, phase=${state.phase}, remediation=[${state.remediation.join(', ')}], pending review=[${state.lastReview.pending.join(', ')}]`);

const pkg = buildReviewPackage(root, FEATURE, rubric, first);
writeReviewPackage(root, FEATURE, pkg);
log(`   review package: ${pkg.items.length} item(s); RB-2 assert.expect = "${pkg.items[0].assert.expect}"`);
log(`   target binding: app.txt sha256 = ${pkg.items[0].targets[0].sha256}`);

// --- step 3: a reviewer performs the assertion and reports with evidence
const rdir = reviewDir(root, FEATURE);
writeFileSync(path.join(rdir, 'evidence.txt'), 'session trace: typed 12.50, pressed Enter; focus moved to confirm, amount persisted.\n');
const report = {
  results: [{
    id: 'RB-2',
    score: 1,
    note: 'performed the assertion in a live session; focus moved to confirm and the amount persisted',
    artifacts: ['app.txt', '.harness/tasks/demo/review/evidence.txt'],
    artifactSha: { 'app.txt': sha256File(path.join(root, 'app.txt')) },
  }],
};
writeFileSync(path.join(rdir, 'report.json'), JSON.stringify(report, null, 2));
const merged = mergeReview(root, FEATURE, rubric, config).evaluation;
log('\n== step 3: harness review-merge (valid report)');
log(`   accepted=[${merged.review.accepted.join(', ')}], problems=${JSON.stringify(merged.review.problems)}`);
log(`   verdict=${merged.verdict} (score ${merged.score})`);

// --- step 4: the artifact changes after the review — the report must not survive it
writeFileSync(path.join(root, 'app.txt'), 'the deliverable under review — edited after the review\n');
const afterTamper = mergeReview(root, FEATURE, rubric, config).evaluation;
log('\n== step 4: harness review-merge again (artifact tampered after review)');
log(`   accepted=[${afterTamper.review.accepted.join(', ')}], problems=${JSON.stringify(afterTamper.review.problems)}`);
log(`   verdict=${afterTamper.verdict}, unverified=[${afterTamper.unverified.join(', ')}] — RB-2 is unverified again`);

log('\n== demo complete: incomplete → review → pass → (tamper) → incomplete');
