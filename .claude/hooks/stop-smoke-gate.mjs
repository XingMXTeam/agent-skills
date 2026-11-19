#!/usr/bin/env node
/**
 * Stop gate: before the session may call itself done, the acceptance
 * chain's smoke subset must still pass.
 *
 * The smoke layer (docs/evaluator-evaluation.md §6) answers one
 * question — is the acceptance chain basically alive? Running it here
 * turns "the agent thinks it is finished" into "the chain was re-run
 * after the last change and still blocks what it must block". Only the
 * smoke subset runs: the full `npm test` takes ~37s and a gate that
 * slow gets bypassed, which makes it decoration.
 *
 * Loop safety: Claude Code sets `stop_hook_active: true` on the Stop
 * payload when this stop is already the result of a hook block. In that
 * case we let the session stop — blocking forever helps no one, and the
 * failure was already reported once, with its reasons.
 *
 * Hook protocol: JSON on stdin; exit 2 blocks the stop and stderr is
 * fed back to the model.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function runSmoke(root = repoRoot()) {
  const res = spawnSync(process.execPath, [path.join(root, 'eval', 'run-eval.mjs'), '--smoke'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120000,
  });
  return { status: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function tail(text, lines = 40) {
  const all = text.trimEnd().split('\n');
  return all.slice(-lines).join('\n');
}

/** Pure decision given the payload and a smoke runner (injected in tests). */
export function decideStop(input, { run = runSmoke } = {}) {
  if (input?.stop_hook_active === true) return { block: false, skipped: 'stop_hook_active — already blocked once, letting it stop' };
  const res = run();
  if (res.status === 0) return { block: false };
  return {
    block: true,
    reason: [
      'Stop blocked: the acceptance chain smoke subset fails after your last change.',
      'Do not call this done — find the first failing case below, fix the chain (or the',
      'change that broke it), and finish again.',
      '',
      tail(res.stdout || res.stderr),
    ].join('\n'),
  };
}

function main() {
  let input = null;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    input = null; // unreadable payload: still run the gate, it is cheap and safe
  }
  const decision = decideStop(input);
  if (decision.block) {
    console.error(decision.reason);
    process.exit(2);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
