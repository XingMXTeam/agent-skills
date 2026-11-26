/**
 * Tests for the definition completeness check (eval/definitions.mjs):
 * the parser and per-check severities on synthetic definitions, plus the
 * scan of this repo's real templates — the counts are pinned so adding
 * or degrading a template definition shows up here, not silently.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDefinition, checkDefinition, checkDefinitions, summarizeDefinitions, formatDefinitionsSection } from '../eval/definitions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const GOOD_SKILL = `---
name: demo-skill
description: Do the demo thing carefully and completely. Use when a demo is requested, and never for production data.
---

# Demo Skill

## Workflow

1. Read the input.
2. Produce the output.

## Done Criteria

- The output file exists.
`;

test('parseDefinition splits frontmatter fields from the body', () => {
  const { frontmatter, body } = parseDefinition(GOOD_SKILL);
  assert.equal(frontmatter.name, 'demo-skill');
  assert.match(frontmatter.description, /^Do the demo thing/);
  assert.match(body, /## Workflow/);
  assert.equal(parseDefinition('# no frontmatter\n').frontmatter, null);
});

test('a complete skill passes; the missing tools field is a note, never a failure', () => {
  const r = checkDefinition({ kind: 'skill', locationName: 'demo-skill', relPath: 'templates/skills/demo-skill/SKILL.md', text: GOOD_SKILL });
  assert.equal(r.status, 'pass');
  assert.deepEqual(r.findings.map((f) => f.level), ['note'], 'only the informational tools note remains');
});

test('no frontmatter or a mismatched name fails: the host cannot roster it', () => {
  const bare = checkDefinition({ kind: 'agent', locationName: 'x', relPath: 'x.md', text: '# Just a title\n' });
  assert.equal(bare.status, 'fail');
  assert.equal(bare.findings[0].check, 'frontmatter');
  const renamed = checkDefinition({
    kind: 'skill',
    locationName: 'demo-skill',
    relPath: 'templates/skills/demo-skill/SKILL.md',
    text: GOOD_SKILL.replace('name: demo-skill', 'name: other-name'),
  });
  assert.equal(renamed.status, 'fail');
  assert.ok(renamed.findings.some((f) => f.check === 'name' && f.level === 'fail'));
});

test('a description without a trigger, and a body without procedure or output, warn', () => {
  const vague = `---
name: vague
description: Helps with various assorted things in the codebase sometimes.
---

# Vague

Some prose about being helpful, with no steps and no definition of done.
`;
  const r = checkDefinition({ kind: 'skill', locationName: 'vague', relPath: 'templates/skills/vague/SKILL.md', text: vague });
  assert.equal(r.status, 'warn');
  const checks = r.findings.filter((f) => f.level === 'warn').map((f) => f.check);
  assert.deepEqual(checks.sort(), ['boundary', 'flow', 'output', 'trigger']);
  for (const f of r.findings) assert.ok(f.why.length > 0, 'every finding must say why it matters');
});

test('the repo templates: 31 definitions, no failures, no warnings, notes as surveyed', () => {
  const results = checkDefinitions(ROOT);
  const s = summarizeDefinitions(results);
  assert.equal(s.files, 31);
  assert.equal(s.agents, 4);
  assert.equal(s.skills, 27);
  assert.equal(s.fail, 0, `no template may be unrosterable: ${JSON.stringify(results.filter((r) => r.status === 'fail'))}`);
  assert.equal(s.notes, 27, 'every skill inherits tools (note); every agent declares them');
  const warned = results.filter((r) => r.status === 'warn');
  assert.equal(warned.length, 0, 'the boundary gaps surveyed in v2 were reported, then fixed by adding an Anti-patterns section to each of the 7 skills; a new warning is a regression, not a survey entry');
  const section = formatDefinitionsSection(results);
  assert.match(section, /Definition completeness/);
  assert.match(section, /not part of the staged-recall score/);
});
