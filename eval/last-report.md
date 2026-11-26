# Evaluator evaluation — scorecard

Stages: **S1 discovery** (the answer-key check produced a raw failure signal) →
**S2 judgment** (the failure became a blocking reason at its own level) →
**S3 verdict** (the chain's final answer blocks delivery). Controls are scored
by false positives: a clean fixture the chain blocks is a false alarm.

## Set: tuning

- Incidents: 4 — S1 recall 4/4 (100%), S2 recall 4/4 (100%), S3 recall 4/4 (100%)
- Controls: 2 — false positives 0

## Set: test

- Incidents: 6 — S1 recall 6/6 (100%), S2 recall 6/6 (100%), S3 recall 6/6 (100%)
- Controls: 3 — false positives 0

## All sets

- Incidents: 10 — S1 recall 10/10 (100%), S2 recall 10/10 (100%), S3 recall 10/10 (100%)
- Controls: 5 — false positives 0

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
Scenario: checkout 路由直接引用 account 路由的内部模块，之后 account 改了内部实现，结账页跟着崩——两个本应独立演进的页面被跨路由耦合绑成一团，一处改动两处买单。
Answer key: checkout 路由横向引用 account 路由的模块必须被 structure/cross-route-import 拦下——跨路由耦合是页面架构最常见的腐烂方式，共享件必须下沉
Source: test/fixtures/scan-bad/src/app/{checkout,account} — the repo's own bad fixture carries cross-route imports

- S1 discovery ✓ — structure/cross-route-import failed — Route "checkout" imports from route "account". Extract the shared piece into api, _components, hooks, or lib. (src/app/checkout/page.ts:1 imports ../account/badge)
- S2 judgment ✓ — structure score 80 vs threshold 85 — below threshold, the dimension itself fails
- S3 verdict ✓ — gate "canRun" failed — structure score 80 < 85

### test-judge-evidence-missing (test, rubric, incident, smoke)

An essential judge item whose evidence file was never written
Scenario: 评估时 judge 项的证据文件根本没生成，评审靠印象给了通过，功能实际没跑通也照样交付——没有证据的判断不存在，这一票放行放的是空气。
Answer key: judge 项没有证据文件必须记 unverified 并触发 essential 未验证否决（fail-closed）——没有证据的判断不存在；未验证既不是通过，也不是普通的 0 分失败（SPEC decision 3/16）
Source: src/evaluate.js runItem judge branch (missing evidence is unverified since v0.12.0; an unverified essential item vetoes fail-closed); the inverse of examples/notice-list's RB-6 trajectory, where evidence existed and said 0

- S1 discovery ✓ — item RB-2 unverified — no judge evidence at .harness/tasks/eval-judge/evaluation/judge-rb-2.json — unevaluated items are unverified, not failed
- S2 judgment ✓ — veto recorded: unverified
- S3 verdict ✓ — final verdict FAIL (score 1 vs pass 0.9, reason: veto)

### test-plan-fp-uncovered (test, scan, incident)

Three of four planned functional points are referenced nowhere in the code
Scenario: 计划里写了四个功能点，代码里只实现了一个，交付验收时才发现另外三个连引用都不存在——计划了却没做、还没留下任何痕迹，是最安静的漏做。
Answer key: 计划里的 FP-2/3/4 在代码里没有任何引用必须被 logic/fp-not-covered 拦下——计划了却没做、还没留下痕迹，是最安静的漏做
Source: test/fixtures/scan-bad/plan.md carries the same defect class (plan points the code never references)

- S1 discovery ✓ — logic/fp-not-covered failed — Plan functional point FP-2 is not referenced anywhere in code or tests. Either it was not built, or it is not traceable — both fail the contract. (plan.md)
- S2 judgment ✓ — logic score 76 vs threshold 80 — below threshold, the dimension itself fails
- S3 verdict ✓ — gate "usageRight" failed — logic score 76 < 80

### test-prd-numbering-gap (test, prd, incident, smoke)

An imported PRD whose requirement numbering skips REQ-3
Scenario: 导入的 PRD 编号从 REQ-2 跳到 REQ-4，下游 rubric 按编号映射需求时，缺号对应的验收项全部落空——那个没编号的需求从此无人验收，直到上线缺功能才被发现。
Answer key: PRD 编号 REQ-1/2/4 缺了 REQ-3，导入时必须报出缺号——编号契约断了，下游 rubric 的需求映射就对不上账
Source: src/prd.js analyzePrd — the v0.9.0 PRD import numbering contract

- S1 discovery ✓ — analyzePrd reports REQ-3 in the missing list
- S2 judgment ✓ — the numbering report is the judgment — no downstream filter
- S3 verdict ✓ — numberingComplete = false

### test-review-tampered-report (test, review, incident)

A review report whose artifact hash no longer matches the disk
Scenario: 复核员验完之后产物又被改了一版，旧报告却写着通过；合并若不比对 SHA，新代码会顶着旧结论交付，复核等于没做。
Answer key: 复核报告绑定的产物 SHA 与磁盘现状不一致时，该条结论必须被拒、项回到 unverified——否则改完代码拿旧报告过关，复核层就成了自报的橡皮图章（SPEC decision 16）
Source: src/review.js validateReviewReport SHA binding; mirrors the judge-evidence freshness/anti-self-report rules

- S1 discovery ✓ — item RB-2 is unverified after the static pass — no probe and no evidence decided it
- S2 judgment ✓ — static verdict INCOMPLETE — the feature is held for review, not passed and not sent to remediation
- S3 verdict ✓ — merged verdict INCOMPLETE (answer key: INCOMPLETE; accepted: [none]; rejected: RB-2 (artifact SHA mismatch for app.txt: the report binds 000000000000… but the artifact on disk is 4e0b184c2a61… — the reviewed bytes are not the current bytes))

### test-review-valid-report (test, review, control)

A valid review report merges and the feature passes
Source: src/review.js validateReviewReport + merge path; the clean counterpart of test-review-tampered-report

- Final: ✓ passes clean

### test-review-veto-unverified (test, review, incident)

An essential interactive item nobody has performed yet
Scenario: 支付页的回车提交只能在真实会话里验证；没人真正按过回车，静态检查却全绿——若未验证的 essential 项被平均分稀释，这个功能会带着没验过的核心交互直接交付。
Answer key: essential 项只能靠交互判定、又没有任何复核结论时必须 fail-closed 否决——未验证不等于通过，更不能让静态项的高分把总裁决抬过线（SPEC decision 16）
Source: src/evaluate.js computeVerdict (unverified veto source) + src/review.js buildReviewPackage; decision 1 of the v0.12.0 review-layer spec

- S1 discovery ✓ — item RB-2 is unverified after the static pass — no probe and no evidence decided it
- S2 judgment ✓ — static verdict FAIL — item RB-2 vetoed with reason "unverified" (fail-closed), and the feature routes to review
- S3 verdict ✓ — merged verdict FAIL (answer key: FAIL; accepted: [none]; rejected: none)

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
Scenario: 评审全程绿灯、覆盖报告显示完整，功能交付后才发现 REQ-2 根本没实现——它只有 important 项撑着、没有 essential 兜底，平均分把没人验收的需求伪装成了已覆盖。
Answer key: REQ-2 只有 important 项、没有 essential，覆盖门禁必须报出这个缺口——没有 essential 兜底的需求，分母就是被掏空的
Source: src/rubric.js coverageGaps + docs/evaluation-rubric-standard.md §8 (the coverage gate)

- S1 discovery ✓ — coverage gap reported: no essential item maps to this requirement
- S2 judgment ✓ — the gap report is the judgment — the coverage gate has no downstream filter to lose it in
- S3 verdict ✓ — coverage gate blocks with 1 gap(s)

### tuning-pitfall-grep-directory (tuning, rubric, incident)

Pitfall grep scoped to the src/ directory must still catch an innerHTML injection
Scenario: 开发者把防注入的 pitfall 检查写成扫整个 src/ 目录，评审满分通过，含 innerHTML 注入的页面直接上线——这条红线存在于纸面，实际上从未运行过一次。
Answer key: pitfall 的 grep 指向目录 src/ 时必须递归命中 innerHTML 赋值并触发一票否决——目录范围的 grep 静默不命中，等于这条红线不存在
Source: src/evaluate.js runItem grep branch: a directory path made target=null and the pattern was never tested — the check silently always passed

- S1 discovery ✓ — item RB-2 scored 0 — pattern /innerHTML\s*=/ in src: found (src/widget.js), expected absent
- S2 judgment ✓ — veto recorded: pitfall triggered: pattern /innerHTML\s*=/ in src: found (src/widget.js), expected absent
- S3 verdict ✓ — final verdict FAIL (score 1 vs pass 0.9, reason: veto)

### tuning-score-dilution-data-spec (tuning, rubric, incident)

A data-contract break diluted by nine passing items: found by the scan item, lost in the average
Scenario: 活动页上线后运行时才白屏：数据契约里少了 startsAt 字段。评审时 scan 明明把该项打了 0 分，却被另外九个通过项的平均分稀释到及格线之上，等于查到了又放行了。
Answer key: 代码声明缺了数据契约里的 startsAt 字段，必须被拦下——契约核心字段的检查不能只是 important，淹没在平均分里等于没查
Source: SPEC decision 4 (veto over averages) names this failure mode; the defect itself is test/fixtures/scan-spec-bad's missing spec field

- S1 discovery ✓ — item RB-10 scored 0 — scan data=92 (min 95) on .; sensor total=86
- S2 judgment ✓ — veto recorded: essential item failed: scan data=92 (min 95) on .; sensor total=86
- S3 verdict ✓ — final verdict FAIL (score 0.9 vs pass 0.9, reason: veto)

### tuning-secret-in-source (tuning, scan, incident, smoke)

Hardcoded API key and a plain-http endpoint in the promo service client
Scenario: 生成的代码把 API key 写死在源码里提交进仓库，任何能读到仓库的人都能拿走这把钥匙盗刷接口——凭证进了代码，就等于已经公开。
Answer key: 源码里硬编码的 API key 必须被 data/hardcoded-secret 拦下——凭证写进代码等于公开，这是生成代码最自信的错误
Source: test/fixtures/scan-bad/src/api.ts — the repo's own bad fixture carries this exact defect pair

- S1 discovery ✓ — data/hardcoded-secret failed — Possible hardcoded credential. Move it to an environment variable — generated code loves inventing plausible-looking keys. (src/api.ts:2)
- S2 judgment ✓ — data score 80 vs threshold 85 — below threshold, the dimension itself fails
- S3 verdict ✓ — gate "dataReady" failed — data score 80 < 85

## Definition completeness (templates — report only)

Scanned 32 definition files (4 agents, 28 skills): 32 pass, 0 warn, 0 fail, 28 notes. This section measures the declarations themselves (frontmatter + SOP body); it is not part of the staged-recall score and never fails the run.

Every definition is complete against the checklist.
Notes (28, informational):

- templates/skills/api-testing/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/autonomous-delivery-proof/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/browserly-advisor/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/bug-root-cause/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/challenge-and-plan/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/clarify-requirements/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/codebase-archaeology-audit/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/component-from-design/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/context-map/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/deterministic-eval/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/e2e-testing/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/fix-from-report/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/i18n-extract/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/implement-task/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/interactive-review/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/plan-before-code/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/repo-community-patrol/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/ship-checklist/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/state-schema-first/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/sync-overview/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/systematic-debugging/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/ui-variants-studio/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/verification-before-completion/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/write-acceptance-criteria/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/write-dev-plan/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/write-prd/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/write-quality-vision/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)
- templates/skills/write-tech-design/SKILL.md: tools not declared — the skill inherits the host session toolset (this repo's skill convention)

## 与基线差异 (differential vs baseline)

No differences from the baseline: every case outcome and stage is unchanged.
