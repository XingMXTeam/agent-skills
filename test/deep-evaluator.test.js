/**
 * Tests for v0.13 Deep Evaluator upgrades across data, logic, and ui dimensions:
 *   - data: field consumption tracking, brownfield frozen/additive-only mutability
 *     guards, and live API contract probe results
 *   - logic: executable functional points bound to real passing tests (rejecting
 *     bare comments), state machine enum/transition coverage, and PBT gate
 *   - ui: computed-style browser DOM layout audit and opt-in Tailwind arbitrary guard
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(HERE, '..', 'bin', 'harness.js');

function makeFixture(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'harness-deep-eval-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return dir;
}

function scanDir(dir) {
  const r = spawnSync(process.execPath, [BIN, 'scan', '--json', dir], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.ok(r.stdout, r.stderr);
  return JSON.parse(r.stdout);
}

// ─── Data dimension: consumption, brownfield mutability, live API probe ──────

test('data: flags declared-but-unconsumed fields and passes when consumed in code', () => {
  const spec = {
    requireConsumption: true,
    interfaces: [{ name: 'Deal', fields: { id: 'string', stage: 'string', ownerAvatar: 'string' } }],
  };
  const badDir = makeFixture({
    'gate.config.json': { inputs: { dataSpec: 'data-spec.json' } },
    'data-spec.json': spec,
    'src/deal.ts': `export interface Deal { id: string; stage: string; ownerAvatar: string; }
export function label(d: Deal) { return d.id + ':' + d.stage; }`,
  });
  const bad = scanDir(badDir);
  const fails = bad.dimensions.data.checks.filter((c) => c.passed === false);
  assert.deepEqual(fails.map((c) => c.name), ['data-spec-field-unconsumed']);
  assert.match(fails[0].message, /ownerAvatar/);

  const goodDir = makeFixture({
    'gate.config.json': { inputs: { dataSpec: 'data-spec.json' } },
    'data-spec.json': spec,
    'src/deal.ts': `export interface Deal { id: string; stage: string; ownerAvatar: string; }
export function label({ id, stage, ownerAvatar }: Deal) { return id + stage + ownerAvatar; }`,
  });
  const good = scanDir(goodDir);
  assert.equal(good.dimensions.data.score, 100);
});

test('data: enforces frozen and additive-only brownfield mutability tiers', () => {
  const spec = {
    interfaces: [
      {
        name: 'Order',
        mutability: 'additive-only',
        frozenFields: ['orderId'],
        fields: { orderId: 'string', totalCents: 'number' },
      },
    ],
  };

  // Additive field in code is allowed on additive-only interfaces
  const okDir = makeFixture({
    'gate.config.json': { inputs: { dataSpec: 'data-spec.json' } },
    'data-spec.json': spec,
    'src/order.ts': `export interface Order { orderId: string; totalCents: number; promoCode?: string; }`,
  });
  assert.equal(scanDir(okDir).dimensions.data.score, 100);

  // Changing frozen field type + dropping additive-only field deducts sharply
  const brokenDir = makeFixture({
    'gate.config.json': { inputs: { dataSpec: 'data-spec.json' } },
    'data-spec.json': spec,
    'src/order.ts': `export interface Order { orderId: number; }`,
  });
  const names = scanDir(brokenDir).dimensions.data.checks.filter((c) => c.passed === false).map((c) => c.name).sort();
  assert.deepEqual(names, ['data-spec-additive-broken', 'data-spec-frozen-broken']);
});

test('data: validates live API contract probe results and reports neutral when unreadable', () => {
  const failDir = makeFixture({
    'gate.config.json': { inputs: { apiContractResults: 'api-probe.json' } },
    'api-probe.json': {
      results: [
        { endpoint: 'GET /api/deals', passed: true },
        { endpoint: 'PATCH /api/deals/:id', passed: false, mismatches: ['data.stage missing'] },
      ],
    },
    'src/index.ts': 'export const ok = true;\n',
  });
  const fail = scanDir(failDir);
  const viol = fail.dimensions.data.checks.find((c) => c.name === 'api-contract-mismatch');
  assert.ok(viol && viol.passed === false);
  assert.match(viol.message, /PATCH \/api\/deals\/:id/);

  const missingDir = makeFixture({
    'gate.config.json': { inputs: { apiContractResults: 'does-not-exist.json' } },
    'src/index.ts': 'export const ok = true;\n',
  });
  const neutral = scanDir(missingDir).dimensions.data.checks.find((c) => c.name === 'api-contract');
  assert.ok(neutral && neutral.passed === null);
});

// ─── Logic dimension: executable spec matrix, state machines & PBT ───────────

test('logic: rejects comment-only FP mentions and passes when backed by passing testResults + PBT', () => {
  const logicSpec = {
    functionalPoints: [{ id: 'FP-1', testPattern: 'drag deal to won' }],
    stateMachines: [
      {
        name: 'DealStage',
        states: ['lead', 'negotiating', 'won'],
        transitions: [{ from: 'negotiating', to: 'won', event: 'MARK_WON' }],
      },
    ],
    requirePropertyTests: true,
  };

  // Comment-only cheat + missing state + no PBT must fail all three
  const cheatDir = makeFixture({
    'gate.config.json': { inputs: { logicSpec: 'logic-spec.json', testResults: 'results.json' } },
    'logic-spec.json': logicSpec,
    'results.json': {
      numPassedTests: 1,
      numFailedTests: 0,
      testResults: [{ assertionResults: [{ fullName: 'renders empty screen', status: 'passed' }] }],
    },
    'src/deal.ts': `// FP-1 drag deal to won; states: lead, negotiating, won
export const stages = ['lead', 'negotiating'];`,
    'src/deal.test.ts': `import { test } from 'node:test'; test('renders empty screen', () => {});`,
  });
  const cheatFails = scanDir(cheatDir).dimensions.logic.checks.filter((c) => c.passed === false).map((c) => c.name).sort();
  assert.deepEqual(cheatFails, [
    'logic-fp-untested',
    'logic-pbt-missing',
    'logic-state-missing',
    'logic-transition-untested',
  ]);

  // Real state enums + passing test matching FP + tested transition + fast-check PBT passes 100
  const passDir = makeFixture({
    'gate.config.json': { inputs: { logicSpec: 'logic-spec.json', testResults: 'results.json' } },
    'logic-spec.json': logicSpec,
    'results.json': {
      numPassedTests: 2,
      numFailedTests: 0,
      testResults: [
        {
          assertionResults: [
            { fullName: 'FP-1 drag deal to won via MARK_WON', status: 'passed' },
            { fullName: 'PBT stage transition invariants', status: 'passed' },
          ],
        },
      ],
    },
    'src/deal.ts': `export const stages = ['lead', 'negotiating', 'won'] as const;`,
    'src/deal.test.ts': `import fc from 'fast-check';
test('negotiating to won via MARK_WON', () => {
  fc.assert(fc.property(fc.string(), (s) => typeof s === 'string'));
});`,
  });
  const pass = scanDir(passDir);
  assert.equal(pass.dimensions.logic.score, 100);
  assert.ok(pass.dimensions.logic.checks.some((c) => c.name === 'logic-fp-verified' && c.passed === true));
  assert.ok(pass.dimensions.logic.checks.some((c) => c.name === 'logic-pbt-present' && c.passed === true));
});

// ─── UI dimension: browser computed-style DOM audit & Tailwind arbitrary cap ─

test('ui: evaluates computed-style DOM audit metrics and Tailwind arbitrary escapes', () => {
  const badDir = makeFixture({
    'gate.config.json': {
      rules: { ui: { maxTailwindArbitraryPerFile: 1 } },
      inputs: { domAuditResults: 'dom-audit.json' },
    },
    'dom-audit.json': {
      pages: [
        {
          name: 'kanban',
          horizontalOverflowPx: 24,
          clippedElements: 2,
          overlappingElements: 1,
          fontScaleViolations: 3,
        },
      ],
    },
    'src/Card.tsx': `export function Card() { return <div className="bg-[#123456] p-[13px] text-[17px]">Hi</div>; }`,
  });
  const badNames = scanDir(badDir).dimensions.ui.checks.filter((c) => c.passed === false).map((c) => c.name).sort();
  assert.deepEqual(badNames, [
    'dom-element-overlap',
    'dom-font-scale-drift',
    'dom-horizontal-overflow',
    'dom-text-clipped',
    'tailwind-arbitrary-values',
  ]);

  const goodDir = makeFixture({
    'gate.config.json': {
      rules: { ui: { maxTailwindArbitraryPerFile: 1 } },
      inputs: { domAuditResults: 'dom-audit.json' },
    },
    'dom-audit.json': {
      pages: [{ name: 'kanban', horizontalOverflowPx: 0, clippedElements: 0, overlappingElements: 0, fontScaleViolations: 0 }],
    },
    'src/Card.tsx': `export function Card() { return <div className="bg-surface p-4 text-base">Hi</div>; }`,
  });
  const good = scanDir(goodDir);
  assert.equal(good.dimensions.ui.score, 100);
  assert.ok(good.dimensions.ui.checks.some((c) => c.name === 'dom-audit-clean' && c.passed === true));
});
