# Evaluator evaluation — scorecard

Stages: **S1 discovery** (the answer-key check produced a raw failure signal) →
**S2 judgment** (the failure became a blocking reason at its own level) →
**S3 verdict** (the chain's final answer blocks delivery). Controls are scored
by false positives: a clean fixture the chain blocks is a false alarm.

## Set: tuning

- Incidents: 4 — S1 recall 4/4 (100%), S2 recall 4/4 (100%), S3 recall 4/4 (100%)
- Controls: 2 — false positives 0

## Set: test

- Incidents: 4 — S1 recall 4/4 (100%), S2 recall 4/4 (100%), S3 recall 4/4 (100%)
- Controls: 2 — false positives 0

## All sets

- Incidents: 8 — S1 recall 8/8 (100%), S2 recall 8/8 (100%), S3 recall 8/8 (100%)
- Controls: 4 — false positives 0

## Per-case detail

### test-clean-layered-rubric (test, rubric, control)

A layered rubric where every item passes, including a judge item with real evidence
Source: hand-built clean layered rubric with valid, present judge evidence

- Final: ✓ passes clean

### test-clean-prd (test, prd, control)

An imported PRD with complete REQ-1..REQ-3 numbering
Source: hand-built complete PRD numbering

- Final: ✓ passes clean

### test-cross-route-import (test, scan, incident, smoke)

A checkout route importing two modules from the account route
Answer key: checkout 路由横向引用 account 路由的模块必须被 structure/cross-route-import 拦下——跨路由耦合是页面架构最常见的腐烂方式，共享件必须下沉
Source: test/fixtures/scan-bad/src/app/{checkout,account} — the repo's own bad fixture carries cross-route imports

- S1 discovery ✓ — structure/cross-route-import failed — Route "checkout" imports from route "account". Extract the shared piece into api, _components, hooks, or lib. (src/app/checkout/page.ts:1 imports ../account/badge)
- S2 judgment ✓ — structure score 80 vs threshold 85 — below threshold, the dimension itself fails
- S3 verdict ✓ — gate "canRun" failed — structure score 80 < 85

### test-judge-evidence-missing (test, rubric, incident, smoke)

An essential judge item whose evidence file was never written
Answer key: judge 项没有证据文件必须记 0 并触发 essential 一票否决——没有证据的判断不存在，不能靠平均分蒙混（SPEC decision 3/15）
Source: src/evaluate.js runItem judge branch (missing evidence scores 0); the inverse of examples/notice-list's RB-6 trajectory, where evidence existed and said 0

- S1 discovery ✓ — item RB-2 scored 0 — no judge evidence at .harness/tasks/eval-judge/evaluation/judge-rb-2.json — unevaluated items score 0
- S2 judgment ✓ — veto recorded: essential item failed: no judge evidence at .harness/tasks/eval-judge/evaluation/judge-rb-2.json — unevaluated items score 0
- S3 verdict ✓ — final verdict FAIL (score 0.5 vs pass 0.9, reason: veto)

### test-plan-fp-uncovered (test, scan, incident)

Three of four planned functional points are referenced nowhere in the code
Answer key: 计划里的 FP-2/3/4 在代码里没有任何引用必须被 logic/fp-not-covered 拦下——计划了却没做、还没留下痕迹，是最安静的漏做
Source: test/fixtures/scan-bad/plan.md carries the same defect class (plan points the code never references)

- S1 discovery ✓ — logic/fp-not-covered failed — Plan functional point FP-2 is not referenced anywhere in code or tests. Either it was not built, or it is not traceable — both fail the contract. (plan.md)
- S2 judgment ✓ — logic score 76 vs threshold 80 — below threshold, the dimension itself fails
- S3 verdict ✓ — gate "usageRight" failed — logic score 76 < 80

### test-prd-numbering-gap (test, prd, incident, smoke)

An imported PRD whose requirement numbering skips REQ-3
Answer key: PRD 编号 REQ-1/2/4 缺了 REQ-3，导入时必须报出缺号——编号契约断了，下游 rubric 的需求映射就对不上账
Source: src/prd.js analyzePrd — the v0.9.0 PRD import numbering contract

- S1 discovery ✓ — analyzePrd reports REQ-3 in the missing list
- S2 judgment ✓ — the numbering report is the judgment — no downstream filter
- S3 verdict ✓ — numberingComplete = false

### tuning-clean-promo-feature (tuning, rubric, control, smoke)

A small clean feature: file present, no injection pattern, data dimension at full score
Source: hand-built clean counterpart of the tuning incident fixtures

- Final: ✓ passes clean

### tuning-clean-scan-project (tuning, scan, control)

A clean mini project: plan fully referenced, tests present and passing, no rule violations
Source: miniature of test/fixtures/scan-good, the repo's pinned all-100 project

- Final: ✓ passes clean

### tuning-coverage-no-essential (tuning, coverage, incident)

A requirement mapped only by an important item must trip the coverage gate
Answer key: REQ-2 只有 important 项、没有 essential，覆盖门禁必须报出这个缺口——没有 essential 兜底的需求，分母就是被掏空的
Source: src/rubric.js coverageGaps + docs/evaluation-rubric-standard.md §8 (the coverage gate)

- S1 discovery ✓ — coverage gap reported: no essential item maps to this requirement
- S2 judgment ✓ — the gap report is the judgment — the coverage gate has no downstream filter to lose it in
- S3 verdict ✓ — coverage gate blocks with 1 gap(s)

### tuning-pitfall-grep-directory (tuning, rubric, incident)

Pitfall grep scoped to the src/ directory must still catch an innerHTML injection
Answer key: pitfall 的 grep 指向目录 src/ 时必须递归命中 innerHTML 赋值并触发一票否决——目录范围的 grep 静默不命中，等于这条红线不存在
Source: src/evaluate.js runItem grep branch: a directory path made target=null and the pattern was never tested — the check silently always passed

- S1 discovery ✓ — item RB-2 scored 0 — pattern /innerHTML\s*=/ in src: found (src/widget.js), expected absent
- S2 judgment ✓ — veto recorded: pitfall triggered: pattern /innerHTML\s*=/ in src: found (src/widget.js), expected absent
- S3 verdict ✓ — final verdict FAIL (score 1 vs pass 0.9, reason: veto)

### tuning-score-dilution-data-spec (tuning, rubric, incident)

A data-contract break diluted by nine passing items: found by the scan item, lost in the average
Answer key: 代码声明缺了数据契约里的 startsAt 字段，必须被拦下——契约核心字段的检查不能只是 important，淹没在平均分里等于没查
Source: SPEC decision 4 (veto over averages) names this failure mode; the defect itself is test/fixtures/scan-spec-bad's missing spec field

- S1 discovery ✓ — item RB-10 scored 0 — scan data=92 (min 95) on .; sensor total=86
- S2 judgment ✓ — veto recorded: essential item failed: scan data=92 (min 95) on .; sensor total=86
- S3 verdict ✓ — final verdict FAIL (score 0.9 vs pass 0.9, reason: veto)

### tuning-secret-in-source (tuning, scan, incident, smoke)

Hardcoded API key and a plain-http endpoint in the promo service client
Answer key: 源码里硬编码的 API key 必须被 data/hardcoded-secret 拦下——凭证写进代码等于公开，这是生成代码最自信的错误
Source: test/fixtures/scan-bad/src/api.ts — the repo's own bad fixture carries this exact defect pair

- S1 discovery ✓ — data/hardcoded-secret failed — Possible hardcoded credential. Move it to an environment variable — generated code loves inventing plausible-looking keys. (src/api.ts:2)
- S2 judgment ✓ — data score 80 vs threshold 85 — below threshold, the dimension itself fails
- S3 verdict ✓ — gate "dataReady" failed — data score 80 < 85

## 与基线差异 (differential vs baseline)

No differences from the baseline: every case outcome and stage is unchanged.
