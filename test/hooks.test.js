/**
 * Tests for the repo's own Claude Code hooks (.claude/hooks/):
 * the PreToolUse guard over the fixed eval exam, and the Stop smoke gate.
 * The decision functions are tested pure; the scripts are also exercised
 * end to end as subprocesses fed hook-shaped stdin, because that is the
 * contract the host actually calls.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decidePreToolUse, isProtectedPath } from '../.claude/hooks/guard-eval-test.mjs';
import { decideStop } from '../.claude/hooks/stop-smoke-gate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const GUARD = path.join(ROOT, '.claude', 'hooks', 'guard-eval-test.mjs');
const STOP_GATE = path.join(ROOT, '.claude', 'hooks', 'stop-smoke-gate.mjs');

const edit = (file_path, extra = {}) => ({ tool_name: 'Edit', tool_input: { file_path }, cwd: ROOT, ...extra });

test('guard: protected paths are the exam and the baseline, not tuning', () => {
  assert.equal(isProtectedPath('eval/test/test-clean-prd/case.json'), true);
  assert.equal(isProtectedPath('eval/baseline.json'), true);
  assert.equal(isProtectedPath('eval/tuning/secret-in-source/case.json'), false, 'tuning cases exist to be tuned against');
  assert.equal(isProtectedPath('eval/lib.mjs'), false);
  assert.equal(isProtectedPath('src/evaluate.js'), false);
});

test('guard: Edit/Write on protected paths block, with the way out stated', () => {
  for (const target of ['eval/test/cross-route-import/case.json', 'eval/baseline.json']) {
    const d = decidePreToolUse(edit(path.join(ROOT, target)), { env: {}, root: ROOT });
    assert.equal(d.block, true, target);
    assert.match(d.reason, /--update-baseline/, 'the block must name the legitimate baseline path');
    assert.match(d.reason, /HARNESS_EVAL_UNLOCK=1/, 'the block must name the loud escape hatch');
  }
  const rel = decidePreToolUse(edit('eval/test/x/case.json'), { env: {}, root: ROOT });
  assert.equal(rel.block, true, 'relative paths resolve against the hook cwd');
});

test('guard: everything else passes — other tools, other paths, unlock env', () => {
  assert.equal(decidePreToolUse(edit(path.join(ROOT, 'src/evaluate.js')), { env: {}, root: ROOT }).block, false);
  assert.equal(decidePreToolUse(edit(path.join(ROOT, 'eval/tuning/x/case.json')), { env: {}, root: ROOT }).block, false);
  assert.equal(
    decidePreToolUse({ tool_name: 'Read', tool_input: { file_path: path.join(ROOT, 'eval/test/x/case.json') }, cwd: ROOT }, { env: {}, root: ROOT }).block,
    false,
    'reading the exam is fine; only editing it is guarded',
  );
  assert.equal(
    decidePreToolUse(edit(path.join(ROOT, 'eval/test/x/case.json')), { env: { HARNESS_EVAL_UNLOCK: '1' }, root: ROOT }).block,
    false,
    'the unlock env var lets one deliberate edit through',
  );
  assert.equal(decidePreToolUse(null, { env: {}, root: ROOT }).block, false, 'malformed payloads never block');
});

function runHook(script, payload, env = {}) {
  return spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: ROOT,
    env: { ...process.env, ...env },
    timeout: 120000,
  });
}

test('guard script end to end: exit 2 on the exam, exit 0 elsewhere', () => {
  const blocked = runHook(GUARD, edit(path.join(ROOT, 'eval/test/x/case.json')));
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /fixed eval exam/);
  const allowed = runHook(GUARD, edit(path.join(ROOT, 'src/evaluate.js')));
  assert.equal(allowed.status, 0);
  const unlocked = runHook(GUARD, edit(path.join(ROOT, 'eval/baseline.json')), { HARNESS_EVAL_UNLOCK: '1' });
  assert.equal(unlocked.status, 0);
});

test('stop gate: stop_hook_active short-circuits (no infinite block loop)', () => {
  let ran = false;
  const d = decideStop({ stop_hook_active: true }, {
    run: () => {
      ran = true;
      return { status: 1, stdout: 'fail', stderr: '' };
    },
  });
  assert.equal(d.block, false);
  assert.equal(ran, false, 'the smoke run is not even attempted once already blocked');
});

test('stop gate: smoke failure blocks with the output attached; success passes', () => {
  const fail = decideStop({}, { run: () => ({ status: 1, stdout: 'case X leaked', stderr: '' }) });
  assert.equal(fail.block, true);
  assert.match(fail.reason, /case X leaked/, 'the blocker must carry the evidence, not just a verdict');
  const ok = decideStop({}, { run: () => ({ status: 0, stdout: '', stderr: '' }) });
  assert.equal(ok.block, false);
});

test('stop gate script end to end: stop_hook_active exits 0 without running', () => {
  const res = runHook(STOP_GATE, { stop_hook_active: true });
  assert.equal(res.status, 0);
});
