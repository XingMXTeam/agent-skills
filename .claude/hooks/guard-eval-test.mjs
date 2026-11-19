#!/usr/bin/env node
/**
 * PreToolUse guard: the eval exam is not editable by hand.
 *
 * eval/test/** is the fixed exam and eval/baseline.json is the recorded
 * standard the acceptance chain is measured against (see
 * docs/evaluator-evaluation.md). Editing them edits the exam, not the
 * code — the same failure as a rubric quietly loosening itself. This
 * hook is the deterministic guardrail: it blocks Edit/Write calls whose
 * target lands on a protected path and says why, out loud, instead of
 * letting the change slip in and be reverse-engineered from a diff.
 *
 * Escape hatch, deliberately loud: HARNESS_EVAL_UNLOCK=1 in the
 * environment lets one call through. Recording a new baseline never
 * needs it — that is `npm run eval -- --update-baseline`.
 *
 * Hook protocol: JSON on stdin; exit 2 blocks the call and stderr is
 * shown to the model. Malformed input never blocks (exit 0) — a guard
 * that crashes shut is worse than no guard.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PROTECTED_FILE = 'eval/baseline.json';
export const PROTECTED_PREFIX = 'eval/test/';

export function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/** Protected = the fixed exam cases or the recorded baseline. Tuning
 *  cases are deliberately NOT protected: they exist to be tuned against. */
export function isProtectedPath(relPosix) {
  return relPosix === PROTECTED_FILE || relPosix.startsWith(PROTECTED_PREFIX);
}

export function blockReason(rel) {
  return [
    `Blocked: ${rel} is part of the fixed eval exam.`,
    'eval/test/** and eval/baseline.json are the standard the acceptance chain is measured',
    'against — editing them changes the exam, not the code under test. If the chain changed,',
    'fix the chain. To record a new baseline after a deliberate, reviewed change, run:',
    '  npm run eval -- --update-baseline',
    'If an exam case itself is truly wrong, set HARNESS_EVAL_UNLOCK=1 and retry — and expect',
    'the edit to be reviewed as a change to the standard itself.',
  ].join('\n');
}

/** Pure decision: { block, reason? } for one PreToolUse payload. */
export function decidePreToolUse(input, { env = process.env, root = repoRoot() } = {}) {
  if (env.HARNESS_EVAL_UNLOCK === '1') return { block: false };
  if (input?.tool_name !== 'Edit' && input?.tool_name !== 'Write') return { block: false };
  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== 'string' || filePath.length === 0) return { block: false };
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(input?.cwd ?? root, filePath);
  const rel = path.relative(root, abs).split(path.sep).join('/');
  if (!isProtectedPath(rel)) return { block: false };
  return { block: true, reason: blockReason(rel) };
}

function main() {
  let input = null;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  const decision = decidePreToolUse(input);
  if (decision.block) {
    console.error(decision.reason);
    process.exit(2);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
