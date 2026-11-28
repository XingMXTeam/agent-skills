<div align="center">

<a href="https://skills.maoxunxing.com/">
  <img src="docs/social-preview.png" alt="ShipProof — 先验真，再上线：独立三层验收与高质量 AI 交付体系" width="100%" />
</a>

<br />

# 🛡️ ShipProof

### **先验真，再上线。拒绝 AI 自己给自己打满分。**
**面向 AI 编程 Agent 的独立三层验真与高质量交付引擎 —— 确定性代码/协议/PBT 属性测试门禁、真浏览器交互走查、SHA-256 防篡改离线 HTML 验收报告、老仓库红线守卫，以及 27 份可执行交付 Skills。**

<p>
  <a href="https://skills.maoxunxing.com/">
    <img src="https://img.shields.io/badge/🛡️_打开交互式光流验真与交付剧场-skills.maoxunxing.com-6366f1?style=for-the-badge" alt="打开可视化工作流" />
  </a>
</p>

<p>
  <img src="https://img.shields.io/badge/独立验真-三层深度评测引擎-22d3ee?style=flat-square" alt="三层深度评测引擎" />
  <img src="https://img.shields.io/badge/Skills-27_份交付契约-8b5cf6?style=flat-square" alt="27 份 Skills" />
  <img src="https://img.shields.io/badge/Antigravity-原生适配-06b6d4?style=flat-square" alt="Antigravity" />
  <img src="https://img.shields.io/badge/Claude_Code-原生适配-f59e0b?style=flat-square" alt="Claude Code" />
  <img src="https://img.shields.io/badge/Codex-原生适配-10b981?style=flat-square" alt="Codex" />
  <img src="https://img.shields.io/badge/Cursor-原生适配-ec4899?style=flat-square" alt="Cursor" />
</p>

[English](./README.md) | **简体中文** · [🌐 可视化光流工作流](https://skills.maoxunxing.com/) · [🧠 Prompt 工作台](https://prompts.maoxunxing.com/) · [🔥 实战知识库 &amp; 1v1 陪跑](https://maoxunxing.com/zh-cn/consult/)

</div>

---

## 🔥 为什么 90% 用 AI 写 SaaS 的项目都会半路烂尾？

| 维度 | ❌ 传统 Vibe Coding（靠聊天赌运气） | 🛡️ 装上 **ShipProof**（验真 + 27 份交付契约）之后 |
| :--- | :--- | :--- |
| **写码之前** | 拿到模糊需求十秒开写，自由发挥六小时方向全错 | **`challenge-and-plan`**：先读仓挑刺、问清 3 个关键问题，给 3 版带取舍方案拍板 |
| **开发过程** | 改好 A 搞坏 B、爱顺手重构无关文件、聊到第 5 轮彻底失忆 | **独立 Worktree 隔离 + 状态先行**：原子提交、长流程规则保留率 ~95% |
| **质量验收** | AI 自己写代码自己夸“已全部通过”，一打开全是报错 | **确定性硬验收**：只认真实构建/测试退出码 + 真浏览器实测截图 + 可双击 HTML 验收报告 |
| **线上修 Bug** | 报错点加一句 `if (!x) return` 糊弄过去，下周继续炸 | **`bug-root-cause` + `systematic-debugging`**：强制先复现、定位上游根因、沉淀防复发规则 |

---

## 🌐 四端自动适配 · 可视化光流交付大图

**点击下方大图，直接前往 [skills.maoxunxing.com](https://skills.maoxunxing.com/) 切换 Antigravity / Claude Code / Codex / Cursor 实时演练全流程 →**

<a href="https://skills.maoxunxing.com/#workflow">
  <img src="docs/workflow-preview.png" alt="skills.maoxunxing.com 四端联动光流工作流" width="100%" />
</a>

> **人只做关键决策，其余全由 AI 自治跑完：** 你只在 **① 立项拍板方案 → ② 睡醒看 HTML 验收报告点合并 → ③ 报 Bug / 提新需求** 这 3 个节点介入；中间的并行编码、浏览器实测与提 PR，Skill 会根据你的工具环境自动唤起最强原生能力。

---

## 🛡️ 为什么敢直接去睡觉？三层智能自动化验收 × v0.13 深度评测引擎

**95% 的验收全部由 AI 自动跑透并绑定防篡改证据，人不当测试员，只做最后 30 秒的老板签字。**

<a href="https://skills.maoxunxing.com/#verification">
  <img src="docs/verification-preview.png" alt="skills.maoxunxing.com 三层智能自动化验收" width="100%" />
</a>

- **第 1 层 · 代码、数据协议与逻辑硬核实跑（`src/gate/rules/`）**
  - **数据真实消费与老仓库红线**：剥离类型声明后检查字段是否在业务代码里真正被消费（`data-spec-field-unconsumed`），强制拦截破坏 `frozen` / `additive-only` 老仓库协议红线的改动，并校验真实接口返回（`inputs.apiContractResults`）。
  - **可执行逻辑规格 + 属性测试（PBT）**：彻底告别“写句 `// FP-1` 注释就能糊弄过关”，强制绑定真实通过的 Jest / Vitest / Playwright 用例、状态机枚举与转换覆盖，以及 `fast-check` 属性测试门禁。
- **第 2 层 · 真浏览器交互走查 + 计算样式 DOM 审计**
  - 独立上下文实操交互（`interactive-review`），结合浏览器 `getComputedStyle` 巡检横向溢出、文本截断、元素重叠与字号阶梯漂移（`inputs.domAuditResults`），并为目标产物绑定 **SHA-256** 防篡改。
- **第 3 层 · 老板 30 秒签字放行**
  - 主观审美与生产上线风险永远归你——前两层全绿后打包为可双击离线打开的 HTML 验收报告，你睡醒扫一眼铁证点 Merge 即可。

---

## ⚡ 一套能力包，自动适配 4 大主流 AI 编程工具（隔离边界）

| 你在用的工具 | 自动读取目录 | 开发 / 验收隔离机制 | 可选手动外挂开关 |
| :--- | :--- | :--- | :--- |
| **Antigravity (反重力)** | `.agents/skills/` | 平台原生动态 **Swarm** 多代理 + 独立 **Browser** 沙箱子代理 | `/goal`（过夜）、`/grill-me`、`/boost`、`/schedule` |
| **Claude Code** | `.claude/skills/` | 仓库内 4 个静态角色子代理（`.claude/agents/*.md`）+ `git worktree` | `/plan`（`Shift+Tab`）、`/compact`、`/loop` |
| **Codex** | `.agents/skills/` | 独立分支 / 沙箱隔离 + 全量确定性构建与测试门禁 | 后台异步多步执行 |
| **Cursor** | `.agents/skills/` | Agent Mode 规则约束 + 分支隔离 + 终端/MCP 验收 | 立项阶段可切 Plan / Ask 模式 |

---

## 📦 27 份实战 Skills 一览（每一份都交付确定结果）

包含 **三层智能自动化验收**（代码/接口实跑 + 真浏览器交互走查与 SHA 防篡改 + 老板 30 秒看报告签字）、**老仓库增量红线模板**（`templates/standards/brownfield-contract.md`）与 **实时采风 UI 试衣间（`ui-variants-studio`）**。前往 **[skills.maoxunxing.com](https://skills.maoxunxing.com/#skills)** 可免费直接复制 6 份核心样本试跑：

- **核心工作流 Meta Skills（5 份）**：`challenge-and-plan` · `ui-variants-studio` · `autonomous-delivery-proof` · `codebase-archaeology-audit` · `repo-community-patrol`
- **需求与契约（6 份）**：`clarify-requirements` · `write-prd` · `write-quality-vision` · `write-tech-design` · `write-dev-plan` · `write-acceptance-criteria`
- **实现与调试（3 份）**：`implement-task` · `systematic-debugging` · `fix-from-report`
- **确定性验收与走查（4 份）**：`deterministic-eval` · `e2e-testing` · `api-testing` · `interactive-review`
- **上线与长期记忆（2 份）**：`ship-checklist` · `sync-overview`
- **前端工程手艺（7 份）**：`context-map` · `plan-before-code` · `state-schema-first` · `component-from-design` · `i18n-extract` · `bug-root-cause` · `verification-before-completion`

---

## 🚀 立即开始

- **🌐 体验可视化光流工作流 & 免费复制 5 份核心 Skill**：[https://skills.maoxunxing.com](https://skills.maoxunxing.com/)
- **🧠 高频实战双语 Prompt 工作台（35 免费 + 20 原创 PRO）**：[https://prompts.maoxunxing.com](https://prompts.maoxunxing.com/)
- **🔥 打包带走完整 Notion 实战知识库（¥199）或预约 1v1 配进你的项目（¥799）**：[https://maoxunxing.com/zh-cn/consult/](https://maoxunxing.com/zh-cn/consult/)

---

<div align="center">
  <strong>作者：<a href="https://maoxunxing.com/zh-cn/">毛毛星 Momo (@maoxunxing)</a></strong> · 前网易 / 阿里 11 年资深前端 · AI 独立开发者
  <br />
  如果这套体系帮你省下了熬夜改 Bug 的时间，欢迎顺手点一个 ⭐ Star！
</div>
