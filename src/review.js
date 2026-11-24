import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { featureDir } from './config.js';
import { resolveFromRoot } from './git.js';
import { evaluateRubric, isRealPng } from './evaluate.js';

/**
 * The review phase (v0.12) — the middle layer of three-layer
 * verification: static probes (the kernel) → agent interactive review
 * (this module's protocol) → human confirmation.
 *
 * Items a static pass cannot decide (rubric `verify: 'interactive'` —
 * the assertion needs real actions: keyboard events, continuous
 * interaction, an end state only a running session reaches — or
 * `verify: 'human'`) stay UNVERIFIED after `harness eval`. The kernel
 * then issues a review package: the pending items, their assertions,
 * and the SHA-256 of every target artifact, frozen at package time.
 * A reviewer (a fresh agent context with operating capability, or a
 * human for human items) performs the assertions and writes a review
 * report. The kernel merges it only after validating it with the same
 * anti-self-report rules judge evidence lives under:
 *
 *   - freshness: a report older than the package it answers is stale;
 *   - cited artifacts must exist; cited PNGs must be real PNGs;
 *   - SHA binding: the bytes the assertion ran against must still be
 *     the bytes on disk — a report bound to a different artifact is
 *     not evidence about this one, and the item stays unverified;
 *   - human items accept only an entry marked confirmedBy: 'human',
 *     with a note.
 *
 * The kernel still never calls an LLM: reviewing is dispatched work,
 * exactly like judging. What the kernel owns is the package, the
 * validation, and the merge — the merge is a fresh evaluation that
 * resolves items from the validated conclusions, so static and merged
 * verdicts can never disagree about the rules.
 */

export function reviewDir(root, feature) {
  return path.join(featureDir(root, feature), 'review');
}

export function reviewPackagePath(root, feature) {
  return path.join(reviewDir(root, feature), 'package.json');
}

export function reviewReportPath(root, feature) {
  return path.join(reviewDir(root, feature), 'report.json');
}

export function sha256File(abs) {
  return createHash('sha256').update(readFileSync(abs)).digest('hex');
}

/** The artifacts an item's verdict is about, with their current hashes. */
export function itemTargets(root, item) {
  if (!item.path) return [];
  const abs = resolveFromRoot(root, item.path);
  return [{ path: item.path, sha256: existsSync(abs) ? sha256File(abs) : null }];
}

/**
 * Build the review package from an evaluation: every unverified
 * interactive/human item, with its assertion and target hashes.
 * (Unverified judge items are NOT review work — they route back to the
 * evaluator, who owes the evidence.)
 */
export function buildReviewPackage(root, feature, rubric, evaluation) {
  const byId = new Map(rubric.items.map((i) => [i.id, i]));
  const items = [];
  for (const r of evaluation.results ?? []) {
    if (r.status !== 'unverified') continue;
    const item = byId.get(r.id);
    if (!item) continue;
    const mode = item.verify ?? 'static';
    if (mode !== 'interactive' && mode !== 'human') continue;
    items.push({
      id: item.id,
      requirement: item.requirement ?? null,
      level: item.level,
      kind: item.kind,
      verify: mode,
      ...(item.anchor ? { anchor: item.anchor } : {}),
      ...(item.assert ? { assert: item.assert } : {}),
      detail: r.detail,
      targets: itemTargets(root, item),
    });
  }
  return { version: 1, feature, generatedAt: Date.now(), basedOnEvaluationAt: evaluation.at ?? null, items };
}

export function writeReviewPackage(root, feature, pkg) {
  const dir = reviewDir(root, feature);
  mkdirSync(dir, { recursive: true });
  const file = reviewPackagePath(root, feature);
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  return file;
}

export function loadReviewPackage(root, feature) {
  const file = reviewPackagePath(root, feature);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Validate a review report against its package. Returns the conclusions
 * the kernel may merge (Map itemId -> {score, status, detail}), the
 * accepted ids, and a problem per item that stays unverified.
 * opts.reportAt: when the report was written (ms) — a report older than
 * the package is stale. opts.minScreenshotBytes mirrors judge evidence.
 */
export function validateReviewReport(root, rubric, pkg, report, opts = {}) {
  const conclusions = new Map();
  const accepted = [];
  const problems = [];
  const minPngBytes = opts.minScreenshotBytes ?? 2048;
  const entries = new Map();
  if (report && Array.isArray(report.results)) {
    for (const e of report.results) if (e && e.id) entries.set(e.id, e);
  }
  const stale = opts.reportAt != null && pkg?.generatedAt != null && opts.reportAt < pkg.generatedAt;

  for (const pItem of pkg?.items ?? []) {
    const reject = (reason) => problems.push({ id: pItem.id, reason });
    const entry = entries.get(pItem.id);
    if (!entry) {
      reject('no review entry — the item was not reviewed');
      continue;
    }
    if (stale) {
      reject('stale review report: written before the review package was generated — re-review against the current package');
      continue;
    }
    const score = Number(entry.score);
    if (![0, 0.5, 1].includes(score)) {
      reject(`review score must be 0, 0.5 or 1 (got ${entry.score})`);
      continue;
    }
    if (entry.verdict !== undefined && entry.verdict !== (score > 0 ? 'pass' : 'fail')) {
      reject(`review verdict "${entry.verdict}" disagrees with score ${score}`);
      continue;
    }
    const mode = pItem.verify;
    if (mode === 'human') {
      if (entry.confirmedBy !== 'human') {
        reject('verify=human: only a human may decide this item — the entry needs "confirmedBy": "human"');
        continue;
      }
      if (!String(entry.note ?? '').trim()) {
        reject('verify=human: a human decision without a note is not a decision — record what was checked');
        continue;
      }
    }
    const artifacts = Array.isArray(entry.artifacts) ? entry.artifacts : [];
    if (mode === 'interactive' && artifacts.length === 0) {
      reject('verify=interactive: the review must cite at least one evidence artifact (screenshot, trace, log) — a conclusion without evidence is a self-report');
      continue;
    }
    const missingArt = artifacts.filter((a) => !existsSync(resolveFromRoot(root, a)));
    if (missingArt.length) {
      reject(`review cites missing artifact(s): ${missingArt.join(', ')}`);
      continue;
    }
    const fakePng = artifacts.filter((a) => /\.png$/i.test(a) && !isRealPng(resolveFromRoot(root, a), minPngBytes));
    if (fakePng.length) {
      reject(`review cites file(s) that are not real PNGs (>= ${minPngBytes}B): ${fakePng.join(', ')}`);
      continue;
    }
    // SHA binding: the artifact the assertion ran against must still be
    // the artifact on disk, byte for byte. Anything else means the
    // review describes different work than the work being shipped.
    let shaProblem = null;
    for (const t of pItem.targets ?? []) {
      const abs = resolveFromRoot(root, t.path);
      if (!existsSync(abs)) { shaProblem = `target artifact ${t.path} no longer exists`; break; }
      if (!artifacts.includes(t.path)) { shaProblem = `the review does not cite the target artifact ${t.path} in "artifacts"`; break; }
      const claimed = entry.artifactSha?.[t.path];
      const current = sha256File(abs);
      if (claimed !== current) {
        shaProblem = `artifact SHA mismatch for ${t.path}: the report binds ${claimed ? `${String(claimed).slice(0, 12)}…` : '(no hash)'} but the artifact on disk is ${current.slice(0, 12)}… — the reviewed bytes are not the current bytes`;
        break;
      }
    }
    if (shaProblem) {
      reject(shaProblem);
      continue;
    }
    conclusions.set(pItem.id, {
      score,
      status: score > 0 ? 'pass' : 'fail',
      detail: `review (${mode}): ${String(entry.note ?? '').trim() || 'no note'}`.slice(0, 300),
    });
    accepted.push(pItem.id);
  }
  return { conclusions, accepted, problems };
}

/** Read package + report from the feature's review/ directory and validate. */
export function loadReviewConclusions(root, feature, rubric, opts = {}) {
  const pkg = loadReviewPackage(root, feature);
  const file = reviewReportPath(root, feature);
  if (!pkg || !existsSync(file)) return { conclusions: new Map(), accepted: [], problems: [], pkg };
  let report;
  try {
    report = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { conclusions: new Map(), accepted: [], problems: [{ id: '*', reason: 'review report is not valid JSON' }], pkg };
  }
  const v = validateReviewReport(root, rubric, pkg, report, { ...opts, reportAt: statSync(file).mtimeMs });
  return { ...v, pkg };
}

/**
 * Merge: a fresh evaluation whose interactive/human items resolve from
 * the validated review conclusions. Items the report did not cover, or
 * whose entries failed validation, stay unverified.
 */
export function mergeReview(root, feature, rubric, config, opts = {}) {
  const { conclusions, accepted, problems, pkg } = loadReviewConclusions(root, feature, rubric, opts);
  const evaluation = evaluateRubric(root, rubric, config, { ...opts, reviewConclusions: conclusions });
  evaluation.review = { packageAt: pkg?.generatedAt ?? null, accepted, problems };
  return { evaluation, accepted, problems, pkg };
}
