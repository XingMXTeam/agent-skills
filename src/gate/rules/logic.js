// Logic dimension: deferred-work markers, debug residue, forbidden
// patterns, plan functional-point coverage. Markers are counted on the
// comment view (that is where they live); code patterns on the code
// view (so a string mentioning a marker no longer counts as one).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractPassedTestTitles } from "../artifacts.js";
import { isTestFile } from "../scan.js";
import { check, countOccurrences, violation } from "./shared.js";

function todoChecks(files, rules, ctx) {
  const checks = [];
  for (const file of files) {
    const todos = countOccurrences(ctx.views.get(file.rel).comments, /\b(TODO|FIXME|HACK)\b/g);
    if (todos > rules.maxTodosPerFile) {
      checks.push(
        violation("too-many-todos", `${todos} TODO/FIXME markers in one file (limit ${rules.maxTodosPerFile}). AI code defers decisions with TODOs — resolve them instead.`, file.rel, 4)
      );
    }
  }
  return checks;
}

function residueChecks(files, rules, ctx) {
  const checks = [];
  const forbidden = (rules.forbiddenPatterns || []).map((p) => new RegExp(p, "g"));
  for (const file of files) {
    const view = ctx.views.get(file.rel);
    const consoles = countOccurrences(view.code, /console\.log\s*\(/g);
    if (consoles > 0) {
      checks.push(
        violation("console-log", `${consoles} console.log statement(s) left in code. Debug output is not a logging strategy.`, file.rel, Math.min(3 * consoles, 12))
      );
    }
    view.code.split("\n").forEach((line, i) => {
      for (const re of forbidden) {
        if (re.test(line)) {
          checks.push(
            violation("forbidden-pattern", `Forbidden pattern ${re.source} must not ship.`, `${file.rel}:${i + 1}`, 10)
          );
        }
      }
    });
  }
  return checks;
}

// FP coverage: the plan's functional points are the contract. Each FP
// id in the plan must be referenced somewhere in code or tests — an FP
// with no reference was planned and silently not built.
function fpChecks(files, ctx) {
  if (!ctx.inputs?.plan) return [];
  try {
    const planText = readFileSync(join(ctx.root, ctx.inputs.plan), "utf8");
    const fpIds = [...new Set([...planText.matchAll(/\bFP-\d+(?:-\d+)?\b/g)].map((m) => m[0]))];
    if (fpIds.length === 0) {
      return [check("fp-coverage", null, "Plan configured but contains no FP ids — coverage unverified.")];
    }
    const corpus = files.map((f) => f.content).join("\n");
    const missing = fpIds.filter((id) => !corpus.includes(id));
    const checks = missing.map((id) =>
      violation("fp-not-covered", `Plan functional point ${id} is not referenced anywhere in code or tests. Either it was not built, or it is not traceable — both fail the contract.`, ctx.inputs.plan, 8)
    );
    if (missing.length === 0)
      checks.push(check("fp-coverage", true, `All ${fpIds.length} plan functional point(s) are referenced in code/tests.`));
    return checks;
  } catch (err) {
    return [check("fp-coverage", null, `Plan could not be read (${err.message}) — coverage unverified.`)];
  }
}

function loadPassedTitles(ctx) {
  const rel = ctx.inputs?.testResults || ctx.inputs?.e2eResults;
  if (!rel) return null;
  try {
    const raw = JSON.parse(readFileSync(join(ctx.root, rel), "utf8"));
    return extractPassedTestTitles(raw);
  } catch {
    return null;
  }
}

// Executable logic spec: verifies functional points are backed by real
// passing tests (never bare source comments), state enums exist in code,
// state transitions are exercised in tests, and optional property-based
// tests (fast-check / test.prop) are present.
function logicSpecChecks(files, ctx) {
  const rel = ctx.inputs?.logicSpec;
  if (!rel) return [];
  let spec;
  try {
    spec = JSON.parse(readFileSync(join(ctx.root, rel), "utf8"));
    if (!spec || typeof spec !== "object") throw new Error("expected JSON object");
  } catch (err) {
    return [check("logic-spec", null, `Logic spec could not be loaded (${err.message}) — executable spec matrix unverified.`)];
  }

  const checks = [];
  const passedTitles = loadPassedTitles(ctx);
  const testFiles = files.filter((f) => isTestFile(f.rel));
  const prodFiles = files.filter((f) => !isTestFile(f.rel));
  const testCorpus = testFiles.map((f) => f.content).join("\n");

  // 1. Executable Functional Points
  if (Array.isArray(spec.functionalPoints) && spec.functionalPoints.length > 0) {
    let covered = 0;
    for (const entry of spec.functionalPoints) {
      const fp = typeof entry === "string" ? { id: entry } : entry;
      if (!fp || typeof fp.id !== "string") continue;
      const needle = fp.testPattern || fp.id;
      const re = fp.testPattern ? new RegExp(fp.testPattern, "i") : null;
      const matches = (text) => (re ? re.test(text) : text.includes(needle));

      if (Array.isArray(passedTitles)) {
        if (passedTitles.some((t) => matches(t))) {
          covered++;
        } else {
          checks.push(
            violation(
              "logic-fp-untested",
              `Functional point "${fp.id}" has no matching PASSED test in testResults (looked for ${needle}). Comments in source code do not prove executable behavior.`,
              rel,
              8
            )
          );
        }
      } else if (matches(testCorpus)) {
        covered++;
      } else {
        checks.push(
          violation(
            "logic-fp-untested",
            `Functional point "${fp.id}" is not exercised in any test file (looked for ${needle}). Bare source comments cannot satisfy executable logic coverage.`,
            rel,
            8
          )
        );
      }
    }
    if (covered === spec.functionalPoints.length && covered > 0) {
      checks.push(
        check(
          "logic-fp-verified",
          true,
          Array.isArray(passedTitles)
            ? `All ${covered} functional point(s) matched passing tests in testResults.`
            : `All ${covered} functional point(s) are exercised in test files.`
        )
      );
    }
  }

  // 2. State machine enum & transition coverage
  if (Array.isArray(spec.stateMachines) && spec.stateMachines.length > 0) {
    const prodLiterals = new Set();
    const prodCode = [];
    for (const f of prodFiles) {
      const v = ctx.views.get(f.rel);
      if (!v) continue;
      prodCode.push(v.code);
      for (const lit of v.literals || []) {
        if (typeof lit.value === "string") prodLiterals.add(lit.value);
      }
    }
    const prodCodeText = prodCode.join("\n");
    const testTextAndTitles = Array.isArray(passedTitles)
      ? `${testCorpus}\n${passedTitles.join("\n")}`
      : testCorpus;

    let smViolations = 0;
    for (const sm of spec.stateMachines) {
      if (!sm || typeof sm.name !== "string") continue;
      for (const st of sm.states || []) {
        const esc = st.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const inCode = prodLiterals.has(st) || new RegExp(`\\b${esc}\\b`).test(prodCodeText);
        if (!inCode) {
          smViolations++;
          checks.push(
            violation(
              "logic-state-missing",
              `State "${st}" of state machine "${sm.name}" is not modeled in non-test source code (comments excluded).`,
              rel,
              7
            )
          );
        }
      }
      for (const tr of sm.transitions || []) {
        const fromOk = !tr.from || testTextAndTitles.includes(tr.from);
        const toOk = !tr.to || testTextAndTitles.includes(tr.to);
        const evOk = !tr.event || testTextAndTitles.includes(tr.event);
        if (!(fromOk && toOk && evOk)) {
          smViolations++;
          const label = `${tr.from || "?"} -> ${tr.to || "?"}${tr.event ? ` (${tr.event})` : ""}`;
          checks.push(
            violation(
              "logic-transition-untested",
              `Transition "${label}" of state machine "${sm.name}" is not exercised in test files or passing test titles.`,
              rel,
              7
            )
          );
        }
      }
    }
    if (smViolations === 0) {
      checks.push(check("logic-state-machines", true, `All ${spec.stateMachines.length} state machine(s) have complete state enums and tested transitions.`));
    }
  }

  // 3. Property-Based Testing (PBT) gate
  if (spec.requirePropertyTests === true) {
    const pbtRe = /\b(?:fc\.assert|fc\.property|fc\.asyncProperty|(?:test|it)\.prop)\s*\(/;
    const pbtFiles = testFiles.filter((f) => {
      const v = ctx.views.get(f.rel);
      return v && pbtRe.test(v.code);
    });
    if (pbtFiles.length === 0) {
      checks.push(
        violation(
          "logic-pbt-missing",
          "Property-based testing is required by logicSpec, but no fast-check (fc.assert/fc.property) or test.prop tests were found in test files.",
          rel,
          10
        )
      );
    } else {
      checks.push(
        check("logic-pbt-present", true, `Property-based tests verified in ${pbtFiles.map((f) => f.rel).join(", ")}.`)
      );
    }
  }

  return checks;
}

export function checkLogic(files, rules, ctx) {
  const checks = [
    ...todoChecks(files, rules, ctx),
    ...residueChecks(files, rules, ctx),
    ...fpChecks(files, ctx),
    ...logicSpecChecks(files, ctx),
  ];
  if (!checks.some((c) => c.passed === false))
    checks.push(check("logic-rules", true, "No leftover debug output or deferred-work pile-ups found."));
  return checks;
}
