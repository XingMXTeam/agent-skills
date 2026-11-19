/**
 * Definition completeness — the static anatomy check for agent and skill
 * definitions (templates/claude-code/agents/*.md, templates/skills/*\/SKILL.md).
 *
 * A markdown file is not an agent: it is the declaration a host runtime
 * parses into one (frontmatter = identity, capability boundary and the
 * trigger the roster matches on; body = the system prompt / SOP). If the
 * declaration is malformed, the runtime either cannot see the definition
 * at all or dispatches it on a guess. This module checks the declaration
 * itself — deterministically, offline, without calling a model.
 *
 * It answers a different question from the staged-recall eval (lib.mjs)
 * and from src/skills-eval.js:
 *   - skills-eval: does a fresh session actually trigger the right skill?
 *   - this check:  is the definition itself complete enough to be
 *                  triggerable, followable and checkable?
 *   - eval/:       does the kernel's acceptance chain block real defects?
 *
 * Severity follows the repo's real conventions, surveyed from the files
 * themselves (not imposed from outside):
 *   - fail: the host cannot identify or roster the definition
 *           (no frontmatter, no name, name/location mismatch, no description)
 *   - warn: the definition can be rostered but is under-specified
 *           (no trigger phrasing, no boundary, no procedure, no output spec)
 *   - note: informational only — e.g. `tools` undeclared. Skills in this
 *           repo never declare tools (they inherit the host session);
 *           that is a convention, not a defect, so it never fails or warns.
 *
 * Report-only: results are printed as their own scorecard section and
 * never change the eval run's exit code. Fixing the templates is a
 * separate act from measuring them.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const AGENTS_DIR = path.join('templates', 'claude-code', 'agents');
export const SKILLS_DIR = path.join('templates', 'skills');

/** Split a markdown file into frontmatter fields and body. */
export function parseDefinition(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { frontmatter: null, body: text };
  const frontmatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (kv) frontmatter[kv[1]] = kv[2].trim();
  }
  return { frontmatter, body: m[2] };
}

const TRIGGER_RE = /\bUse\b|\bWhen\b[^.]*\b(fails?|returns?|shows?|has|is|needs?)\b/i;
const BOUNDARY_DESC_RE = /\bnever\b|\bonly\b|\bnot for\b|\bdo not use\b/i;
const BOUNDARY_HEAD_RE = /boundaries|anti-patterns|not evidence|never|editable scope/i;
const FLOW_HEAD_RE = /workflow|procedure|steps?\b|process|action:|gate|read first|how to|method|build|structure|sections? of|mode check|the gate|in this order/i;
const OUTPUT_HEAD_RE = /output|handoff|done criteria|report/i;

function headings(body) {
  return [...body.matchAll(/^#{1,3}\s+(.*)$/gm)].map((x) => x[1]);
}

/**
 * Check one definition file. `kind` is 'agent' | 'skill'; `locationName`
 * is the name the location itself declares (file base name for agents,
 * directory name for skills).
 */
export function checkDefinition({ kind, locationName, relPath, text }) {
  const findings = [];
  const add = (check, level, message, why) => findings.push({ check, level, message, why });
  const { frontmatter, body } = parseDefinition(text);

  if (!frontmatter) {
    add('frontmatter', 'fail', 'no --- frontmatter block', 'the host reads identity and trigger from frontmatter; without it this file is invisible to the roster — a definition the runtime cannot parse is not an agent or skill at all');
    return finish(kind, relPath, findings);
  }

  const name = frontmatter.name ?? '';
  if (!name) {
    add('name', 'fail', 'frontmatter has no name', 'the roster keys definitions by name; an unnamed definition cannot be dispatched or even listed');
  } else if (name !== locationName) {
    add('name', 'fail', `name "${name}" does not match its location "${locationName}"`, 'hosts and humans find definitions by location; a name that disagrees with its file/directory makes every reference ambiguous');
  }

  const description = frontmatter.description ?? '';
  if (!description) {
    add('description', 'fail', 'frontmatter has no description', 'the main session matches tasks against descriptions — no description means the definition can never be picked, however good its body is');
  } else {
    if (description.length < 30) {
      add('description', 'warn', `description is only ${description.length} characters`, 'the roster matches on this text alone; a near-empty description gives the matcher almost nothing to match against');
    }
    if (!TRIGGER_RE.test(description)) {
      add('trigger', 'warn', 'description states no trigger (no "Use when/for/…" or "When …" clause)', 'the description is the dispatch rule: it must say when to call this definition, or the host guesses — and guesses wrong in both directions');
    }
    const heads = headings(body);
    if (!BOUNDARY_DESC_RE.test(description) && !heads.some((h) => BOUNDARY_HEAD_RE.test(h))) {
      add('boundary', 'warn', 'nothing states when NOT to use it (no never/only in the description, no boundaries or anti-patterns section)', 'a trigger without a boundary over-fires: the dual failure of a missing trigger, and the one that pollutes unrelated work');
    }
    const numberedSteps = (body.match(/^\d+\.\s+\S/gm) ?? []).length;
    if (!heads.some((h) => FLOW_HEAD_RE.test(h)) && numberedSteps < 2) {
      add('flow', 'warn', 'body has no procedure (no workflow/steps/action section, no numbered procedure)', 'the body is the SOP the model follows; without steps it is a wish, and the model improvises a different procedure every run');
    }
    if (!heads.some((h) => OUTPUT_HEAD_RE.test(h))) {
      add('output', 'warn', 'body names no output, handoff or done criteria', 'if "finished" is not specified, the caller cannot check the result — unverifiable output is how confident nonsense ships');
    }
  }

  if (!('tools' in frontmatter)) {
    add(
      'tools',
      'note',
      kind === 'skill'
        ? 'tools not declared — the skill inherits the host session toolset (this repo\'s skill convention)'
        : 'tools not declared — the agent inherits the host session toolset (agents in this repo declare theirs)',
      'an undeclared toolset is the widest possible capability boundary; fine when deliberate, invisible when accidental',
    );
  }

  return finish(kind, relPath, findings);
}

function finish(kind, relPath, findings) {
  const status = findings.some((f) => f.level === 'fail') ? 'fail' : findings.some((f) => f.level === 'warn') ? 'warn' : 'pass';
  return { file: relPath, kind, status, findings };
}

/** Discover and check every definition under <repoRoot>/templates. */
export function checkDefinitions(repoRoot) {
  const results = [];
  const agentsDir = path.join(repoRoot, AGENTS_DIR);
  if (existsSync(agentsDir)) {
    for (const name of readdirSync(agentsDir).sort()) {
      if (!name.endsWith('.md')) continue;
      const abs = path.join(agentsDir, name);
      results.push(
        checkDefinition({
          kind: 'agent',
          locationName: name.replace(/\.md$/, ''),
          relPath: path.join(AGENTS_DIR, name).split(path.sep).join('/'),
          text: readFileSync(abs, 'utf8'),
        }),
      );
    }
  }
  const skillsDir = path.join(repoRoot, SKILLS_DIR);
  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!name.isDirectory()) continue;
      const abs = path.join(skillsDir, name.name, 'SKILL.md');
      if (!existsSync(abs)) continue;
      results.push(
        checkDefinition({
          kind: 'skill',
          locationName: name.name,
          relPath: path.join(SKILLS_DIR, name.name, 'SKILL.md').split(path.sep).join('/'),
          text: readFileSync(abs, 'utf8'),
        }),
      );
    }
  }
  return results;
}

export function summarizeDefinitions(results) {
  return {
    files: results.length,
    agents: results.filter((r) => r.kind === 'agent').length,
    skills: results.filter((r) => r.kind === 'skill').length,
    pass: results.filter((r) => r.status === 'pass').length,
    warn: results.filter((r) => r.status === 'warn').length,
    fail: results.filter((r) => r.status === 'fail').length,
    notes: results.reduce((n, r) => n + r.findings.filter((f) => f.level === 'note').length, 0),
  };
}

const LEVEL_MARK = { fail: '✗', warn: '⚠', note: '·' };

/** Render the scorecard section. Report-only: never affects the exit code. */
export function formatDefinitionsSection(results) {
  const s = summarizeDefinitions(results);
  const out = [];
  out.push('## Definition completeness (templates — report only)');
  out.push('');
  out.push(
    `Scanned ${s.files} definition files (${s.agents} agents, ${s.skills} skills): ` +
      `${s.pass} pass, ${s.warn} warn, ${s.fail} fail, ${s.notes} notes. ` +
      'This section measures the declarations themselves (frontmatter + SOP body); ' +
      'it is not part of the staged-recall score and never fails the run.',
  );
  out.push('');
  const flagged = results.filter((r) => r.status !== 'pass');
  if (flagged.length === 0) out.push('Every definition is complete against the checklist.');
  for (const r of flagged) {
    out.push(`### ${r.file} (${r.kind}) — ${r.status.toUpperCase()}`);
    out.push('');
    for (const f of r.findings) {
      if (f.level === 'note') continue;
      out.push(`- ${LEVEL_MARK[f.level]} [${f.check}] ${f.message} — why it matters: ${f.why}`);
    }
    out.push('');
  }
  const noted = results.flatMap((r) => r.findings.filter((f) => f.level === 'note').map((f) => ({ file: r.file, ...f })));
  if (noted.length > 0) {
    out.push(`Notes (${noted.length}, informational):`);
    out.push('');
    for (const n of noted) out.push(`- ${n.file}: ${n.message}`);
    out.push('');
  }
  return out.join('\n');
}
