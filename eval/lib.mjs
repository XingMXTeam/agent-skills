/**
 * Evaluator evaluation — the harness's own acceptance chain, put on trial.
 *
 * Method (from the Claude Code team's verification practice):
 *   - Review the reviewers: the chain that judges features (scan sensor →
 *     rubric evaluation → coverage gate → PRD contract) is itself judged
 *     against a fixed set of incident cases with one-sentence answer keys
 *     and clean controls that must all pass.
 *   - Staged recall: an incident counts separately at three stages —
 *     (1) discovery: the answer-key check produced a raw failure signal;
 *     (2) judgment: that failure became a blocking reason at its own level
 *         (dimension below threshold / item in the veto list / gate gap);
 *     (3) verdict: the chain's final answer blocks the delivery.
 *     A defect found at stage 1 but lost by stage 3 is a leak between
 *     stages, and the stages show exactly where it leaked.
 *   - Strict scoring: only the check named by the answer key scores.
 *     A case "caught" by an unrelated check is noted, not counted.
 *   - Tuning/test split: cases under tuning/ may be used to tune rubrics
 *     and thresholds; cases under test/ are a fixed exam — never tuned
 *     against, or the exam becomes a memory test.
 *
 * Everything here is deterministic and offline: the kernel never calls an
 * LLM, and neither does its evaluation.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runScan, loadScanConfig } from '../src/scan.js';
import { evaluateRubric } from '../src/evaluate.js';
import { validateRubric, coverageGaps } from '../src/rubric.js';
import { analyzePrd } from '../src/prd.js';
import { DEFAULT_CONFIG, deepMerge } from '../src/config.js';

export const SETS = ['tuning', 'test'];
export const CHAINS = ['scan', 'rubric', 'coverage', 'prd'];
export const EVAL_CONFIG = { evaluation: { commandTimeoutMs: 30000 } };

/** Discover case definitions under <evalRoot>/{tuning,test}/<id>/case.json. */
export function discoverCases(evalRoot) {
  const out = [];
  for (const set of SETS) {
    const dir = path.join(evalRoot, set);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (!name.isDirectory()) continue;
      const caseDir = path.join(dir, name.name);
      const file = path.join(caseDir, 'case.json');
      if (!existsSync(file)) throw new Error(`eval case ${set}/${name.name}: missing case.json`);
      const def = JSON.parse(readFileSync(file, 'utf8'));
      validateCaseDef(def, `${set}/${name.name}`);
      out.push({ def, set, caseDir, workspace: path.join(caseDir, 'workspace') });
    }
  }
  return out.sort((a, b) => a.def.id.localeCompare(b.def.id));
}

export function validateCaseDef(def, where = def?.id ?? '(unknown)') {
  const need = (cond, msg) => {
    if (!cond) throw new Error(`eval case ${where}: ${msg}`);
  };
  need(def && typeof def === 'object', 'case.json must be an object');
  need(typeof def.id === 'string' && def.id.length > 0, 'id is required');
  need(['incident', 'control'].includes(def.kind), 'kind must be incident|control');
  need(CHAINS.includes(def.chain), `chain must be one of ${CHAINS.join('/')}`);
  need(typeof def.title === 'string' && def.title.length > 0, 'title is required');
  if (def.kind === 'incident') {
    need(def.expect && typeof def.expect === 'object', 'incident cases need an expect (the answer key)');
    need(typeof def.expect.why === 'string' && def.expect.why.length > 0, 'expect.why is the one-sentence answer key — required');
    if (def.chain === 'scan') {
      need(def.expect.dimension && def.expect.check, 'scan incidents need expect.dimension + expect.check');
    }
    if (def.chain === 'rubric') need(def.expect.item, 'rubric incidents need expect.item');
    if (def.chain === 'coverage') need(def.expect.requirement, 'coverage incidents need expect.requirement');
    if (def.chain === 'prd') need(def.expect.missingId, 'prd incidents need expect.missingId');
  }
  if (def.chain === 'rubric' || def.chain === 'coverage') {
    need(typeof def.rubric === 'string' && def.rubric.length > 0, `${def.chain} cases need a "rubric" file name`);
  }
  return def;
}

// ---------------------------------------------------------------------------
// Chain runners: feed one case workspace through the real acceptance chain
// and extract the observations the staged scoring reads. No verdicts are
// invented here — every observation is a value the chain itself produced.
// ---------------------------------------------------------------------------

function scanObservation(workspace) {
  const report = runScan(workspace);
  const config = loadScanConfig(workspace);
  const gateForDimension = {};
  for (const g of config.gates) {
    for (const dim of Object.keys(g.requires ?? {})) {
      gateForDimension[dim] ??= report.gates.find((r) => r.gate === g.id) ?? null;
    }
  }
  return {
    report,
    failedChecks: report.failedReasons.map((r) => ({ dim: r.dim, check: r.check, why: r.why, evidence: r.evidence })),
    dimensions: Object.fromEntries(
      Object.entries(report.dimensions).map(([dim, d]) => [dim, { score: d.score, threshold: d.threshold, passed: d.passed }]),
    ),
    gateForDimension,
  };
}

function loadCaseRubric(caseDir, def) {
  const rubric = JSON.parse(readFileSync(path.join(caseDir, def.rubric), 'utf8'));
  validateRubric(rubric); // also assigns item weights, exactly like the real flow
  return rubric;
}

function rubricObservation(workspace, rubric, caseConfig) {
  const config = deepMerge(deepMerge(structuredClone(DEFAULT_CONFIG), structuredClone(EVAL_CONFIG)), caseConfig ?? {});
  const evaluation = evaluateRubric(workspace, rubric, config);
  return {
    evaluation,
    itemScores: new Map(evaluation.results.map((r) => [r.id, r.score])),
    itemDetails: new Map(evaluation.results.map((r) => [r.id, r.detail])),
    vetoReasons: new Map(evaluation.vetoed.map((v) => [v.id, v.reason])),
    gaps: coverageGaps(rubric),
  };
}

// ---------------------------------------------------------------------------
// Staged scoring. Pure functions of (case definition, observations).
// ---------------------------------------------------------------------------

export function scanFailed(obs, dimension, check) {
  return obs?.failedChecks.find((f) => f.dim === dimension && f.check === check) ?? null;
}

export function scoreScanIncident(def, obs) {
  const { dimension, check } = def.expect;
  const hit = scanFailed(obs, dimension, check);
  const dim = obs.dimensions[dimension];
  const gate = obs.gateForDimension[dimension];
  return {
    s1: Boolean(hit),
    s1Note: hit ? `${dimension}/${check} failed — ${hit.why}${hit.evidence ? ` (${hit.evidence})` : ''}` : `${dimension}/${check} did not fail`,
    s2: dim ? dim.passed === false : false,
    s2Note: dim ? `${dimension} score ${dim.score} vs threshold ${dim.threshold} — ${dim.passed === false ? 'below threshold, the dimension itself fails' : 'still above threshold, the failure is not decisive at dimension level'}` : `dimension ${dimension} not scored`,
    s3: gate ? gate.passed === false : obs.report.passed === false,
    s3Note: gate ? `gate "${gate.gate}" ${gate.passed === false ? `failed — ${gate.detail}` : `passed — ${gate.detail}`}` : `scan verdict ${obs.report.passed ? 'PASS' : 'FAIL'}`,
  };
}

export function scoreRubricIncident(def, obs, scanObs) {
  const item = def.expect.item;
  const itemScore = obs.itemScores.get(item);
  const viaItem = itemScore === 0;
  const viaCheck = def.expect.check ? Boolean(scanFailed(scanObs, def.expect.check.dimension, def.expect.check.name)) : false;
  const vetoReason = obs.vetoReasons.get(item);
  return {
    s1: viaItem || viaCheck,
    s1Note: viaItem
      ? `item ${item} scored 0 — ${obs.itemDetails.get(item) ?? ''}`
      : viaCheck
        ? `scan check ${def.expect.check.dimension}/${def.expect.check.name} failed (the item reading it did not reach 0)`
        : `item ${item} scored ${itemScore ?? 'n/a'} and no answer-key scan check failed — no raw signal`,
    s2: Boolean(vetoReason),
    s2Note: vetoReason ? `veto recorded: ${vetoReason}` : `item ${item} is not in the veto list — its failure (if any) is diluted into the average`,
    s3: obs.evaluation.verdict === 'fail',
    s3Note: `final verdict ${obs.evaluation.verdict.toUpperCase()} (score ${obs.evaluation.score} vs pass ${obs.evaluation.passScore}, reason: ${obs.evaluation.verdictReason})`,
  };
}

export function scoreCoverageIncident(def, obs) {
  const gap = obs.gaps.find((g) => g.requirement === def.expect.requirement);
  return {
    s1: Boolean(gap),
    s1Note: gap ? `coverage gap reported: ${gap.problem}` : `no coverage gap for ${def.expect.requirement}`,
    // The coverage gate has no intermediate filter: a reported gap IS the
    // judgment. The stage exists so the report shape stays uniform.
    s2: Boolean(gap),
    s2Note: gap ? 'the gap report is the judgment — the coverage gate has no downstream filter to lose it in' : 'no gap to judge',
    s3: obs.gaps.length > 0,
    s3Note: obs.gaps.length > 0 ? `coverage gate blocks with ${obs.gaps.length} gap(s)` : 'coverage gate is green',
  };
}

export function scorePrdIncident(def, obs) {
  const hit = obs.missing.includes(def.expect.missingId);
  return {
    s1: hit,
    s1Note: hit ? `analyzePrd reports ${def.expect.missingId} in the missing list` : `missing list is [${obs.missing.join(', ')}] — ${def.expect.missingId} not reported`,
    s2: hit,
    s2Note: hit ? 'the numbering report is the judgment — no downstream filter' : 'nothing to judge',
    s3: obs.numberingComplete === false,
    s3Note: `numberingComplete = ${obs.numberingComplete}`,
  };
}

export function scoreControl(def, obs) {
  const noise = [];
  let falsePositive = false;
  if (def.chain === 'rubric') {
    falsePositive = obs.evaluation.verdict === 'fail';
    for (const r of obs.evaluation.results) if (r.score === 0) noise.push(`item ${r.id} scored 0: ${r.detail}`);
    for (const g of obs.gaps) noise.push(`coverage gap: ${g.requirement}: ${g.problem}`);
  } else if (def.chain === 'scan') {
    falsePositive = obs.report.passed === false;
    for (const f of obs.failedChecks) noise.push(`scan ${f.dim}/${f.check} failed: ${f.why}`);
  } else if (def.chain === 'prd') {
    falsePositive = obs.numberingComplete === false;
    for (const m of obs.missing) noise.push(`PRD numbering reports missing ${m}`);
  } else if (def.chain === 'coverage') {
    falsePositive = obs.gaps.length > 0;
    for (const g of obs.gaps) noise.push(`coverage gap: ${g.requirement}: ${g.problem}`);
  }
  return { falsePositive, noise };
}

// ---------------------------------------------------------------------------
// Run one case end to end.
// ---------------------------------------------------------------------------

export function runCase({ def, set, caseDir, workspace }) {
  const base = {
    id: def.id,
    set,
    kind: def.kind,
    chain: def.chain,
    title: def.title,
    source: def.source ?? null,
    smoke: def.smoke === true,
    knownGap: def.knownGap === true,
    why: def.expect?.why ?? null,
  };
  if (!existsSync(workspace)) throw new Error(`eval case ${def.id}: missing workspace/ directory`);

  const wantsScan = def.chain === 'scan' || Boolean(def.expect?.check) || Array.isArray(def.relevantDimensions);
  const scanObs = wantsScan ? scanObservation(workspace) : null;

  if (def.chain === 'scan') {
    if (def.kind === 'incident') {
      const stages = scoreScanIncident(def, scanObs);
      return { ...base, stages, blocked: stages.s3, detail: [stages.s1Note, stages.s2Note, stages.s3Note] };
    }
    const { falsePositive, noise } = scoreControl(def, { report: scanObs.report, failedChecks: scanObs.failedChecks });
    return { ...base, falsePositive, noise, detail: noise.length ? noise : ['scan verdict PASS, no failed checks'] };
  }

  if (def.chain === 'rubric' || def.chain === 'coverage') {
    const rubric = loadCaseRubric(caseDir, def);
    if (def.chain === 'coverage') {
      const obs = { gaps: coverageGaps(rubric) };
      if (def.kind === 'incident') {
        const stages = scoreCoverageIncident(def, obs);
        return { ...base, stages, blocked: stages.s3, detail: [stages.s1Note, stages.s2Note, stages.s3Note] };
      }
      const { falsePositive, noise } = scoreControl(def, obs);
      return { ...base, falsePositive, noise, detail: noise.length ? noise : ['coverage gate green'] };
    }
    const obs = rubricObservation(workspace, rubric, def.config);
    if (def.kind === 'incident') {
      const stages = scoreRubricIncident(def, obs, scanObs);
      return { ...base, stages, blocked: stages.s3, detail: [stages.s1Note, stages.s2Note, stages.s3Note] };
    }
    const scoped = scanObs && Array.isArray(def.relevantDimensions)
      ? { ...scanObs, failedChecks: scanObs.failedChecks.filter((f) => def.relevantDimensions.includes(f.dim)) }
      : scanObs;
    const { falsePositive, noise } = scoreControl(def, obs);
    if (scoped) for (const f of scoped.failedChecks) noise.push(`scan ${f.dim}/${f.check} failed: ${f.why}`);
    return { ...base, falsePositive, noise, detail: noise.length ? noise : [`verdict PASS (score ${obs.evaluation.score})`] };
  }

  // prd chain
  const prdFile = path.join(workspace, def.prdFile ?? 'prd.md');
  if (!existsSync(prdFile)) throw new Error(`eval case ${def.id}: missing ${def.prdFile ?? 'prd.md'} in workspace`);
  const analysis = analyzePrd(readFileSync(prdFile, 'utf8'));
  const obs = { missing: analysis.missing, numberingComplete: analysis.numberingComplete };
  if (def.kind === 'incident') {
    const stages = scorePrdIncident(def, obs);
    return { ...base, stages, blocked: stages.s3, detail: [stages.s1Note, stages.s2Note, stages.s3Note] };
  }
  const { falsePositive, noise } = scoreControl(def, obs);
  return { ...base, falsePositive, noise, detail: noise.length ? noise : ['PRD numbering complete'] };
}

export function runCases(cases) {
  return cases.map((c) => runCase(c));
}

// ---------------------------------------------------------------------------
// Aggregation + baseline (the differential layer).
// ---------------------------------------------------------------------------

export function summarize(results) {
  const incidents = results.filter((r) => r.kind === 'incident');
  const controls = results.filter((r) => r.kind === 'control');
  const stage = (key) => incidents.filter((r) => r.stages?.[key]).length;
  return {
    incidents: incidents.length,
    s1: stage('s1'),
    s2: stage('s2'),
    s3: stage('s3'),
    controls: controls.length,
    falsePositives: controls.filter((r) => r.falsePositive).length,
    misses: incidents.filter((r) => !r.stages?.s3 && !r.knownGap),
    knownGapMisses: incidents.filter((r) => !r.stages?.s3 && r.knownGap),
    noisyControls: controls.filter((r) => r.noise?.length > 0),
  };
}

/** The per-case outcome a baseline records: the final verdict of the chain. */
export function outcomeOf(result) {
  if (result.kind === 'incident') {
    return { outcome: result.blocked ? 'blocked' : 'passed', stages: [result.stages.s1, result.stages.s2, result.stages.s3] };
  }
  return { outcome: result.falsePositive ? 'false-positive' : 'clean', stages: null };
}

export function baselineFromResults(results) {
  const cases = {};
  for (const r of results) cases[r.id] = outcomeOf(r);
  return { version: 1, cases };
}

/**
 * Differential comparison against a stored baseline. A "flip" is a change
 * in the final outcome; stage changes without a flip are listed too, as
 * early warning — a defect that drops from stage 3 to stage 1 has not
 * regressed yet, but it is one dilution away from shipping.
 */
export function diffBaseline(baseline, results) {
  const flips = [];
  const stageChanges = [];
  const added = [];
  const removed = [];
  const seen = new Set();
  for (const r of results) {
    seen.add(r.id);
    const before = baseline.cases[r.id];
    const now = outcomeOf(r);
    if (!before) {
      added.push(r.id);
      continue;
    }
    if (before.outcome !== now.outcome) {
      const regression =
        (r.kind === 'incident' && before.outcome === 'blocked' && now.outcome === 'passed') ||
        (r.kind === 'control' && before.outcome === 'clean' && now.outcome === 'false-positive');
      flips.push({ id: r.id, kind: r.kind, from: before.outcome, to: now.outcome, regression });
    } else if (before.stages && now.stages && before.stages.join() !== now.stages.join()) {
      stageChanges.push({ id: r.id, from: before.stages, to: now.stages });
    }
  }
  for (const id of Object.keys(baseline.cases)) if (!seen.has(id)) removed.push(id);
  return { flips, stageChanges, added, removed };
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

const pct = (hits, total) => (total === 0 ? '—' : `${hits}/${total} (${Math.round((hits / total) * 1000) / 10}%)`);
const mark = (b) => (b ? '✓' : '✗');

export function formatReport(results, { baselineDiff = null, baselineNote = null } = {}) {
  const out = [];
  out.push('# Evaluator evaluation — scorecard');
  out.push('');
  out.push('Stages: **S1 discovery** (the answer-key check produced a raw failure signal) →');
  out.push('**S2 judgment** (the failure became a blocking reason at its own level) →');
  out.push('**S3 verdict** (the chain\'s final answer blocks delivery). Controls are scored');
  out.push('by false positives: a clean fixture the chain blocks is a false alarm.');
  out.push('');
  for (const set of [...SETS, 'all']) {
    const rs = set === 'all' ? results : results.filter((r) => r.set === set);
    if (rs.length === 0) continue;
    const s = summarize(rs);
    out.push(`## ${set === 'all' ? 'All sets' : `Set: ${set}`}`);
    out.push('');
    out.push(`- Incidents: ${s.incidents} — S1 recall ${pct(s.s1, s.incidents)}, S2 recall ${pct(s.s2, s.incidents)}, S3 recall ${pct(s.s3, s.incidents)}`);
    out.push(`- Controls: ${s.controls} — false positives ${s.falsePositives}`);
    out.push('');
  }
  out.push('## Per-case detail');
  out.push('');
  for (const r of results) {
    out.push(`### ${r.id} (${r.set}, ${r.chain}, ${r.kind}${r.smoke ? ', smoke' : ''}${r.knownGap ? ', known gap' : ''})`);
    out.push('');
    out.push(r.title);
    if (r.why) out.push(`Answer key: ${r.why}`);
    if (r.source) out.push(`Source: ${r.source}`);
    out.push('');
    if (r.kind === 'incident') {
      out.push(`- S1 discovery ${mark(r.stages.s1)} — ${r.detail[0]}`);
      out.push(`- S2 judgment ${mark(r.stages.s2)} — ${r.detail[1]}`);
      out.push(`- S3 verdict ${mark(r.stages.s3)} — ${r.detail[2]}`);
    } else {
      out.push(`- Final: ${r.falsePositive ? '✗ FALSE POSITIVE — the chain blocks a clean fixture' : '✓ passes clean'}`);
      for (const n of r.noise) out.push(`- noise: ${n}`);
    }
    out.push('');
  }
  if (baselineDiff) {
    out.push('## 与基线差异 (differential vs baseline)');
    out.push('');
    const { flips, stageChanges, added, removed } = baselineDiff;
    if (flips.length === 0 && stageChanges.length === 0 && added.length === 0 && removed.length === 0) {
      out.push('No differences from the baseline: every case outcome and stage is unchanged.');
    }
    for (const f of flips) {
      out.push(`- **${f.id}** (${f.kind}): ${f.from} → ${f.to}${f.regression ? ' — ⚠️ REGRESSION' : ''}`);
    }
    for (const s of stageChanges) {
      out.push(`- ${s.id}: stages [${s.from.map(mark).join(' ')}] → [${s.to.map(mark).join(' ')}] (final outcome unchanged)`);
    }
    for (const id of added) out.push(`- ${id}: new case, not in baseline`);
    for (const id of removed) out.push(`- ${id}: in baseline but not in this run`);
    out.push('');
  } else if (baselineNote) {
    out.push('## 与基线差异 (differential vs baseline)');
    out.push('');
    out.push(baselineNote);
    out.push('');
  }
  const s = summarize(results);
  if (s.knownGapMisses.length > 0) {
    out.push('## Known gaps (declared, not counted as failures)');
    out.push('');
    for (const r of s.knownGapMisses) out.push(`- ${r.id}: ${r.why}`);
    out.push('');
  }
  return out.join('\n');
}

/** A run fails when a non-declared incident leaks past S3, a control is
 *  falsely blocked, or the baseline diff shows a regression flip. */
export function runFailed(results, baselineDiff = null) {
  const s = summarize(results);
  if (s.misses.length > 0 || s.falsePositives > 0) return true;
  if (baselineDiff?.flips.some((f) => f.regression)) return true;
  return false;
}
