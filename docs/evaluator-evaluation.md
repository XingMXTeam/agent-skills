# Evaluating the evaluator

The harness exists to judge other people's work. This page is about how
the harness's own judgment is judged — because an acceptance chain that
is never itself evaluated drifts exactly like an unreviewed reviewer:
one incident becomes a global rule, nobody checks the blast radius, and
nobody notices the misses.

The method is adapted from the Claude Code team's verification practice
(verification loops; "review the reviewers"; staged recall; turning
misses into rules), mapped onto this repo's real chain:

| Team practice | Here |
| --- | --- |
| Incident-based evaluation with a one-sentence answer key | `eval/` incident cases, each with `expect.why` |
| Clean changes as a control against over-flagging | Control cases that must all pass |
| Recall measured separately for raw findings, post-verification findings and final review | Staged recall S1 → S2 → S3 (below) |
| Tuning set split from a fixed test set | `eval/tuning/` vs `eval/test/` |
| Turn misses into rules | The tuning loop in §5; two v1 misses became a kernel fix and a rubric rule |
| A check must say why it pulled in a reviewer | Every stage line in the scorecard carries the chain's own message (check text, veto reason, gate detail) |

## 1. The chain under evaluation

Four links, all deterministic, none calling a model:

1. **Scan sensor** (`src/scan.js` → `src/gate/evaluate.js`): five
   dimensions, named checks, dimension thresholds, named gates.
2. **Rubric evaluation** (`src/evaluate.js`): per-item scores, veto on
   essential-0 / triggered pitfall, weighted score vs passScore.
3. **Coverage gate** (`src/rubric.js` `coverageGaps`): every requirement
   needs an essential item — the denominator cannot be gamed.
4. **PRD contract** (`src/prd.js` `analyzePrd`): imported requirement
   numbering must be gapless.

## 2. Stages

For an incident case, each stage answers a different question:

- **S1 — discovery.** Did the answer-key check produce a raw failure
  signal? (The named scan check failed; the named rubric item scored 0.)
  Only the check the answer key names counts — being caught by an
  unrelated check is noted in the detail, never scored. An evaluation
  that rewards "something fired" teaches the chain to over-report.
- **S2 — judgment.** Did that failure become a blocking reason at its
  own level? (Dimension below its threshold; item present in the veto
  list; coverage gap reported.) A failure that exists but is not
  decisive anywhere is a leak in the making.
- **S3 — verdict.** Did the chain's final answer block delivery?
  (Rubric verdict `fail`; the gate requiring that dimension failed;
  coverage gate non-green; PRD numbering incomplete.)

The gap between stages is the diagnostic: S1 ✓ / S3 ✗ means the chain
*found* the defect and then lost it — the exact failure staged recall
exists to expose. For the coverage and PRD links there is no
intermediate filter, so S2 = S1 by construction; the report says so
rather than pretending a stage exists.

Controls are scored by **false positives**: a clean fixture the chain
blocks. Item-level zeros and stray failed checks on a passing control
are reported as *noise* — worth seeing, not counted as false positives.

## 3. Case anatomy

```
eval/{tuning|test}/<case-id>/
  case.json      id, kind (incident|control), chain (scan|rubric|coverage|prd),
                 title, source, smoke?, expect (incidents), rubric (file name)
  rubric.json    rubric cases only — the rubric under test is part of the case
  workspace/     the fixture project the chain runs against
```

- `expect.why` is the answer key: one sentence naming the check that
  must fire and why. No why, no case — `validateCaseDef` refuses it.
- `source` records where the defect really came from (a repo fixture, a
  SPEC decision, a kernel behavior). Synthetic defects are allowed only
  when they map one-to-one onto a real check.
- `smoke: true` marks the case for the smoke layer (§6).

**Adding a case:** create the directory, write the smallest workspace
that carries exactly one defect (or none, for a control), write the
answer key, run `npm run eval`. Put it in `tuning/` while it is new;
promotion to `test/` is a deliberate act, and once there, the case is
frozen — if the chain changes and a test case starts failing, the chain
changed, not the exam.

**Tuning discipline.** Rubrics and thresholds may be tuned against
`tuning/` only. Tuning against `test/` converts the exam into a memory
test and every number it produces becomes a lie. This mirrors the
kernel's own rule that a rubric may tighten itself but never loosen
itself quietly.

## 4. Running it

```
npm run eval                          # full run: scorecard + baseline diff,
                                      # writes eval/last-report.md
npm run eval -- --set tuning          # one set, stdout only
npm run eval -- --smoke               # smoke subset only
npm run eval -- --update-baseline     # explicitly record a new baseline
```

Exit code is 1 when a non-declared incident leaks past S3, a control is
falsely blocked, or the baseline diff contains a regression flip. A case
that documents a real, currently-unfixable gap may declare
`"knownGap": true` with its reason in the answer key; it is reported
under *Known gaps* and does not fail the run. v1 ships with no known
gaps — both v1 misses were fixable, and were fixed (§5).

## 5. What v1 found, and what it changed

First run (before tuning): **S1 7/8, S2 6/8, S3 6/8, false positives 0.**
The test set was clean at every stage; both leaks were in tuning, and
both were real:

1. **A pitfall that did not exist** (`tuning-pitfall-grep-directory`).
   A pitfall `grep` item scoped to a directory (`path: "src"`) silently
   never matched: `runItem` tested the pattern only against files, so a
   directory path meant "not found" forever. The fixture's `innerHTML`
   injection sailed through with a perfect score of 1.0. This is the
   worst kind of miss — not a weak check, an absent one wearing a
   check's clothes.
   **Fix (kernel):** directory-scoped greps now recurse
   (`walkFiles` in `src/evaluate.js`, skipping vendor/hidden dirs,
   capped), and the match detail names the file that hit. A unit test
   pins the behavior so it cannot silently regress.

2. **A contract break diluted to exactly the pass line**
   (`tuning-score-dilution-data-spec`). The scan item found the missing
   contract field (data = 92 < the item's minScore 95, item scored 0 —
   S1 ✓), but the item was `important`, so the failure dissolved into
   the average: final score 0.900 against a 0.9 bar, verdict PASS. The
   chain found the defect and then lost it between S1 and S3 — visible
   only because the stages are measured separately.
   **Fix (rule, not code):** the item was promoted to `essential`. The
   general rule the miss produced, now recorded on the item itself:
   *a check on a requirement's core contract is essential, never
   averageable.* This is SPEC decision 4 (veto over averages) applied
   at rubric-authoring time.

After tuning: **S1 8/8, S2 8/8, S3 8/8, false positives 0**, and the
all-green result is recorded as the v1 baseline (§6, differential
layer).

## 6. The three test layers

The evaluation is run at three depths, on three cadences. Each layer
catches what the layer above cannot:

### Smoke layer — every `npm test`

A small subset of eval cases (marked `smoke: true` in `case.json`: the
hardcoded secret, the cross-route import, the missing judge evidence,
the PRD numbering gap, and one clean control) runs inside
`test/eval.test.js` on every `npm test`. It answers one question: *is
the acceptance chain basically alive?* It is deliberately tiny and fast
(the whole subset runs in tens of milliseconds) — a smoke test that
takes minutes gets skipped, and a skipped smoke test is no smoke test.
The full eval remains `npm run eval`, run on demand and before releases.

### Property layer — every `npm test`

`test/property.test.js` attacks the kernel's invariants with generated
inputs: a seeded PRNG (mulberry32, seed fixed in the file) produces 200
random cases per invariant, so failures are reproducible — the seed and
a greedily-shrunk minimal counterexample are printed with the failure.
Zero new dependencies. The invariants are the design's load-bearing
claims:

1. **Veto** — a failed essential or a triggered pitfall fails the
   verdict regardless of every other item's score or weight.
2. **SHA** — a mutated commit SHA (bit-flipped hex or shape-broken)
   never verifies against the repo; the real HEAD always does.
3. **Monotonicity** — appending a failing item to a passing evaluation
   makes it fail; appending passing items to a vetoed evaluation never
   rescues it.
4. **Determinism** — the same rubric over the same workspace evaluates
   to the identical result twice (the kernel's core promise: files are
   the state, evaluation is a pure function of them).
5. **Coverage gate** — a requirement is reported as a gap *if and only
   if* it has no essential item.

Example-based cases (the eval set, the unit tests) check what someone
thought of; properties check what nobody thought of, across the whole
input space the generator can reach.

### Differential layer — every full `npm run eval`

`eval/baseline.json` stores the per-case outcomes of the v1 all-green
run, committed with the repo. Every full eval run diffs itself against
the baseline and prints a *与基线差异* section: every case whose final
outcome flipped (blocked ↔ passed, clean ↔ false-positive), with
regression flips (an incident that used to be blocked now passing; a
control newly blocked) failing the run. Stage changes that do not flip
the outcome are listed separately — a defect sliding from S3 to S1 has
not regressed yet, but it is one dilution away from shipping, and the
diff is where you see it first.

The baseline is only rewritten by the explicit
`npm run eval -- --update-baseline`. Never auto-update it: a baseline
that follows the code proves nothing, the same way a rubric that
loosens itself proves nothing.

## 7. Reading a scorecard

Start at the summary of the set you care about. S3 recall below 100%
means defects ship; find them in the per-case detail and read the stage
marks top-down — the first ✗ is where the chain lost the defect, and
the note on that line is the chain's own words about why. False
positives above 0 mean the chain cries wolf; the noise lines on passing
controls are the early-warning version of the same problem. Then read
the differential section: it tells you what *changed*, which is the
only thing a number alone cannot.
