import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { featureDir } from './config.js';
import { resolveFromRoot } from './git.js';
import { runScan } from './scan.js';
import { layerKey } from './rubric.js';
import { loadVerify, runCheck, verifyEvidenceProblems } from './verify.js';
export { DEFAULT_LAYER_WEIGHTS, layerKey } from './rubric.js';

/**
 * Run one rubric item. Returns { score, status, detail } where status is
 * 'pass' | 'fail' | 'unverified' and score is 0 | 0.5 | 1 for decided
 * items, null for unverified ones.
 *
 * Deterministic kinds (command/file/grep) are only ever 0 or 1 — the
 * kernel never lets a model grade what a script can decide. kind=judge
 * is the one exception: an evaluator agent writes { score, note } to the
 * item's evidence file. Since v0.12 a judge item whose evidence is
 * missing, stale or unusable is UNVERIFIED, not 0 — "nobody looked" is
 * a different fact from "someone looked and it failed", and conflating
 * them is how unverified work shipped as a low score. Items declared
 * verify: 'interactive' | 'human' are never decided here at all: they
 * resolve only from a validated review conclusion (src/review.js),
 * passed in as opts.reviewConclusions.
 */
export function runItem(root, item, timeoutMs, scanCache = new Map(), opts = {}) {
  const mode = item.verify ?? 'static';
  if (mode === 'interactive' || mode === 'human') {
    const c = opts.reviewConclusions?.get(item.id);
    if (c) return { score: c.score, status: c.status, detail: c.detail };
    return { score: null, status: 'unverified', detail: `verify=${mode}: no validated review conclusion yet — decided in the review phase, not by the static pass` };
  }
  const decided = (score, detail) => ({ score, status: score > 0 ? 'pass' : 'fail', detail });
  const unverified = (detail) => ({ score: null, status: 'unverified', detail });
  switch (item.kind) {
    case 'scan': {
      // Sensor input, not a second verdict: read one dimension score from
      // the gate engine and compare it with this item's own minScore.
      const target = resolveFromRoot(root, item.path ?? '.');
      if (!scanCache.has(target)) scanCache.set(target, runScan(target));
      const report = scanCache.get(target);
      const dim = report.dimensions[item.dimension];
      if (!dim) return decided(0, `scan: no dimension "${item.dimension}" in report`);
      const ok = dim.score >= item.minScore;
      return decided(ok ? 1 : 0, `scan ${item.dimension}=${dim.score} (min ${item.minScore}) on ${item.path ?? '.'}; sensor total=${report.totalScore}`);
    }
    case 'command': {
      const r = spawnSync(item.command, { cwd: root, shell: true, encoding: 'utf8', timeout: timeoutMs });
      const ok = r.status === 0;
      const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-3).join(' | ').slice(0, 300);
      return decided(ok ? 1 : 0, `exit=${r.status}${tail ? ` ${tail}` : ''}`);
    }
    case 'verify': {
      // The project's own verification check, run by the kernel. The run is
      // recorded in .harness/verify/last.json like any `fh verify`.
      const manifest = loadVerify(root);
      const check = manifest?.checks.find((c) => c.id === item.check);
      if (!check) return decided(0, `verify: no check "${item.check}" in .harness/verify.json`);
      const run = runCheck(root, check, timeoutMs);
      return decided(run.status === 'passed' ? 1 : 0, `verify ${check.id}: \`${check.command}\` exit=${run.exitCode}${run.tail ? ` ${run.tail.split('\n').slice(-2).join(' | ')}` : ''}`.slice(0, 300));
    }
    case 'file': {
      const p = resolveFromRoot(root, item.path);
      if (!existsSync(p)) return decided(0, `missing file: ${item.path}`);
      const bytes = statSync(p).size;
      if (item.minBytes && bytes < item.minBytes) return decided(0, `${item.path} is ${bytes}B < minBytes ${item.minBytes} (blank/stub?)`);
      return decided(1, `${item.path} exists (${bytes}B)`);
    }
    case 'grep': {
      const p = resolveFromRoot(root, item.path);
      if (!existsSync(p)) return { score: 0, detail: `missing file: ${item.path}` };
      // A grep scoped to a directory searches every file under it,
      // recursively. (It used to test nothing at all for directories —
      // the pattern silently never matched, so a pitfall written against
      // a directory was a red line that did not exist. Found by the
      // evaluator evaluation, eval/tuning/pitfall-grep-directory.)
      const re = new RegExp(item.pattern, 'm');
      let found = false;
      let hit = null;
      if (statSync(p).isDirectory()) {
        for (const file of walkFiles(p)) {
          let text;
          try {
            text = readFileSync(file, 'utf8');
          } catch {
            continue; // unreadable (binary, permissions) — not evidence either way
          }
          if (re.test(text)) {
            found = true;
            hit = path.relative(root, file);
            break;
          }
        }
      } else if (re.test(readFileSync(p, 'utf8'))) {
        found = true;
      }
      const expect = item.expect ?? 'present';
      const ok = expect === 'present' ? found : !found;
      return decided(ok ? 1 : 0, `pattern /${item.pattern}/ in ${item.path}: ${found ? `found${hit ? ` (${hit})` : ''}` : 'not found'}, expected ${expect}`);
    }
    case 'judge': {
      const p = resolveFromRoot(root, item.evidence);
      if (!existsSync(p)) return unverified(`no judge evidence at ${item.evidence} — unevaluated items are unverified, not failed`);
      // Freshness: evidence older than the work it judges (or, in the
      // confirmation pass, older than the previous evaluation) was not
      // produced by a fresh evaluator for this state of the code.
      if (opts.freshSince && statSync(p).mtimeMs < opts.freshSince) {
        return unverified(`stale judge evidence at ${item.evidence}: written before ${new Date(opts.freshSince).toISOString()} (${opts.freshReason ?? 'the latest change'}) — regenerate it in a fresh evaluator context`);
      }
      let ev;
      try {
        ev = JSON.parse(readFileSync(p, 'utf8'));
      } catch {
        return unverified(`judge evidence at ${item.evidence} is not valid JSON`);
      }
      const s = Number(ev.score);
      if (![0, 0.5, 1].includes(s)) return unverified(`judge evidence score must be 0, 0.5 or 1 (got ${ev.score})`);
      const artifacts = Array.isArray(ev.artifacts) ? ev.artifacts : [];
      const missing = artifacts.filter((a) => !existsSync(resolveFromRoot(root, a)));
      if (missing.length) return unverified(`judge evidence cites missing artifact(s): ${missing.join(', ')}`);
      // Verify runs cited as evidence must be the kernel's own record: passed,
      // at the current HEAD, after the latest work. With requireVerify a
      // positive score that cites none is a self-report, not evidence.
      const cited = Array.isArray(ev.verify) ? ev.verify : [];
      if (cited.length) {
        const problems = verifyEvidenceProblems(root, cited, opts);
        if (problems.length) return unverified(`judge evidence cites unusable verify run(s): ${problems.join('; ')}`.slice(0, 300));
      } else if (opts.requireVerify && s > 0) {
        return unverified(`judge evidence cites no verify run — evidence.requireVerify is on: run \`fh verify\` and list the check ids in "verify"`);
      }
      // A red line declared "(check: screenshot)" is judged from pixels:
      // its judge item must cite at least one real PNG screenshot.
      const anchor = opts.vision?.get?.(item.anchor);
      if (anchor && anchor.type === 'RL' && /check\s*:\s*screenshot/i.test(anchor.text)) {
        const minBytes = opts.minScreenshotBytes ?? 2048;
        const real = artifacts.filter((a) => /\.png$/i.test(a) && isRealPng(resolveFromRoot(root, a), minBytes));
        if (!real.length) return unverified(`${item.anchor} is a screenshot-checked red line; the judge evidence must cite at least one real PNG (>= ${minBytes}B) in "artifacts" — run harness capture`);
      }
      return decided(s, `judge: ${ev.note ?? ''}`.slice(0, 300));
    }
    default:
      return decided(0, `unknown kind ${item.kind}`);
  }
}

export function isRealPng(file, minBytes) {
  if (!existsSync(file)) return false;
  const buf = readFileSync(file);
  return buf.length >= minBytes && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

/**
 * All files under a directory, recursively, for directory-scoped greps.
 * Skips vendor/hidden directories (node_modules, .git, .harness…) and
 * caps the walk so a rubric pointed at a huge tree stays bounded.
 */
export function walkFiles(dir, cap = 5000) {
  const out = [];
  const walk = (d) => {
    if (out.length >= cap) return;
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= cap) return;
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/**
 * Weighted score. Flat mode (default): sum(score*weight)/sum(weight) over
 * non-pitfall items. Layered mode (rubric.layerWeights set): each layer
 * L1–L4 is scored on its own, then combined with the layer weights,
 * renormalized over the layers that actually have items.
 *
 * Unverified items are excluded from BOTH numerator and denominator, in
 * both modes: the score is a statement about verified work only. A layer
 * whose items are all unverified contributes nothing and is omitted —
 * it is reported through the verdict (incomplete), not as a fake 0.
 */
export function weightedScore(rubric, results) {
  const scored = results.filter((r) => r.item.level !== 'pitfall' && r.status !== 'unverified');
  const round = (x) => Math.round(x * 1000) / 1000;
  if (!rubric.layerWeights) {
    const denom = scored.reduce((s, r) => s + r.item.weight, 0);
    const numer = scored.reduce((s, r) => s + r.score * r.item.weight, 0);
    return { score: denom === 0 ? 0 : round(numer / denom), layers: null };
  }
  const layers = {};
  for (const r of scored) {
    const k = layerKey(r.item.layer);
    layers[k] ??= { numer: 0, denom: 0, weight: rubric.layerWeights[k] ?? 0 };
    layers[k].numer += r.score * r.item.weight;
    layers[k].denom += r.item.weight;
  }
  let total = 0;
  let wsum = 0;
  const out = {};
  for (const [k, l] of Object.entries(layers)) {
    if (l.denom === 0) continue;
    const ls = l.numer / l.denom;
    out[k] = { score: round(ls), weight: l.weight };
    total += ls * l.weight;
    wsum += l.weight;
  }
  return { score: wsum === 0 ? 0 : round(total / wsum), layers: out };
}

/**
 * Turn per-item results into the verdict. Pure function of (rubric,
 * results, passScore) — the review merge re-derives verdicts through the
 * same code path, so a reviewed evaluation can never disagree with a
 * static one about what the rules mean.
 *
 * Verdict rules (in order — the veto is the point):
 *  1. Veto: a pitfall item that fails (score 0 — pitfall items are
 *     written so score 1 = clean, 0 = the forbidden thing is present),
 *     or an essential item scoring 0. An essential or pitfall item that
 *     is UNVERIFIED vetoes too, fail-closed (reason 'unverified'): a red
 *     line nobody checked is not a red line that held.
 *  2. Any remaining unverified item ⇒ 'incomplete'. The score cannot
 *     ground a fail yet — it is computed over verified items only, and
 *     the pending reviews may move it either way.
 *  3. Otherwise the weighted score must reach passScore.
 */
export function computeVerdict(rubric, results, passScore) {
  const vetoed = [];
  const unverified = [];
  for (const r of results) {
    if (r.status === 'unverified') {
      unverified.push(r.item.id);
      if (r.item.level === 'pitfall' || r.item.level === 'essential') {
        vetoed.push({ id: r.item.id, reason: 'unverified', detail: r.detail });
      }
      continue;
    }
    if (r.item.level === 'pitfall' && r.score === 0) vetoed.push({ id: r.item.id, reason: `pitfall triggered: ${r.detail}` });
    if (r.item.level === 'essential' && r.score === 0) vetoed.push({ id: r.item.id, reason: `essential item failed: ${r.detail}` });
  }

  const { score, layers } = weightedScore(rubric, results);

  let verdict;
  let verdictReason;
  if (vetoed.length > 0) { verdict = 'fail'; verdictReason = 'veto'; }
  else if (unverified.length > 0) { verdict = 'incomplete'; verdictReason = 'unverified'; }
  else if (score >= passScore) { verdict = 'pass'; verdictReason = 'score'; }
  else { verdict = 'fail'; verdictReason = 'below-pass-score'; }
  return { verdict, verdictReason, score, layers, vetoed, unverified };
}

/**
 * Score a rubric. opts.reviewConclusions (Map itemId -> {score, status,
 * detail}) carries validated review-phase conclusions for
 * interactive/human items; without one, such an item is unverified.
 */
export function evaluateRubric(root, rubric, config, opts = {}) {
  const timeoutMs = config.evaluation.commandTimeoutMs;
  const scanCache = new Map(); // one sensor run per target path, shared by all scan items
  const itemOpts = { ...opts, minScreenshotBytes: opts.minScreenshotBytes ?? config.evidence?.minScreenshotBytes ?? 2048, requireVerify: opts.requireVerify ?? Boolean(config.evidence?.requireVerify) };
  const results = rubric.items.map((item) => ({ item, ...runItem(root, item, timeoutMs, scanCache, itemOpts) }));

  const { verdict, verdictReason, score, layers, vetoed, unverified } = computeVerdict(rubric, results, config.evaluation.passScore);
  return {
    at: Date.now(),
    verdict,
    // Why it did not pass, in the fixed vocabulary the routing table uses.
    verdictReason,
    score,
    passScore: config.evaluation.passScore,
    ...(layers ? { layers } : {}),
    vetoed,
    unverified,
    results: results.map((r) => ({ id: r.item.id, requirement: r.item.requirement ?? null, level: r.item.level, kind: r.item.kind, verify: r.item.verify ?? 'static', ...(r.item.layer ? { layer: r.item.layer } : {}), status: r.status, score: r.score, detail: r.detail })),
  };
}

export function writeReport(root, feature, evaluation) {
  const dir = path.join(featureDir(root, feature), 'evaluation');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `report-${evaluation.at}.json`);
  writeFileSync(file, `${JSON.stringify(evaluation, null, 2)}\n`);
  writeFileSync(path.join(dir, 'report.json'), `${JSON.stringify(evaluation, null, 2)}\n`);
  return file;
}

/** Delivery gate: run configured commands fail-fast. Returns { passed, steps }. */
export function runGateCommands(root, config) {
  const steps = [];
  for (const cmd of config.gateCommands) {
    const started = Date.now();
    const r = spawnSync(cmd, { cwd: root, shell: true, encoding: 'utf8', timeout: config.evaluation.commandTimeoutMs });
    const step = { command: cmd, status: r.status === 0 ? 'passed' : 'failed', exitCode: r.status, durationMs: Date.now() - started };
    steps.push(step);
    if (step.status !== 'passed') return { passed: false, failedAt: cmd, steps };
  }
  return { passed: true, failedAt: null, steps };
}
