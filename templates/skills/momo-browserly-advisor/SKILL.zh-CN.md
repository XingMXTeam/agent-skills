<!-- 中文阅读版。生效文件是同目录的 SKILL.md（宿主只加载它）；本文件仅供阅读，内容与英文版一一对应。 -->

# 浏览器智能体选型顾问（momo-browserly-advisor）

> 数据事实源：[Browserly](https://browserly.maoxunxing.com)（最近一手核验：`2026-11-02`，收录 `17` 个活跃方案，外加 Browserbase 配套设施注记）。
> 设计原则：**认知诚实（Epistemic Honesty）** — 严禁编造 `unknown` 价格、许可证或反爬 SLA；若常规确定性 Playwright 足够，明确告知用户无需引入重型 LLM Browser Agent。

## 适用边界

- 为 Coding Agent（Claude Code / Antigravity / Cursor / Codex）挑选或挂载浏览器驱动 / MCP 工具。
- 在本机复用已登录会话操作后台（微信/小红书/内部 ERP/CRM），或构建无人值守的云端/自托管浏览器自动化任务。
- 在 `playwright-mcp`、`browser-use`、`stagehand`、`skyvern`、`ego-lite`、`huashu-chrome`、`agent-browser`、`opencode-browse`、`notte`、`browsentic` 等方案之间做工程取舍。
- 在 `e2e-testing` 或 `interactive-review` 流程中，遇到必须复用真实登录态、跨站探索或风控拦截而无法靠纯脚本覆盖时，触发本 Skill 做驱动升级选型。

不适用场景：
- 自家 Web 应用的常规确定性回归测试与 CI 验收（请直接使用 `@playwright/test` / `e2e-testing`）。
- 纯后端 HTTP/GraphQL 接口测试（请使用 `api-testing`）。

## 执行流程

1. **先自动探测当前工作区**：读取 `package.json`、`pyproject.toml`、`.mcp.json`、`.cursor/`、`.claude/`、`.agents/`，能从代码库确定的条件直接填入参数，不重复追问。
2. **最多追问 3 个高杠杆硬约束**：合并为一次简短提问，补齐未知约束——① 登录态与凭证边界（`local-session` / `isolated-profile` / `cloud-vault`）；② 部署与协议边界（`self-host` / `cloud` 与 `free-oss` / `oss-any` / `paid-ok`）；③ 接入形态与风控压力（`required` MCP / `sdk-cli` 与 `none` / `login-reuse` / `stealth-captcha`）。
3. **调用实时选型引擎（断网自动降级）**：
   - 联网优先请求 `https://browserly.maoxunxing.com/api/recommend?useCase=...&auth=...&hosting=...&mcp=...&antiBot=...&budget=...&locale=zh`（完整目录见 `/api/agents` 与 `/llms.txt`）；
   - 无网/沙盒环境直接按英文版文末内置的 17 行一手核验快照执行同等硬排除与取舍。
4. **输出 5 段式选型诊断书**：首选方案（Primary Pick）、备选/互补方案（Runner-up）、为什么不选其他热门方案（Why-Not Exclusions）、风险与未核实项警示（Caveats & Unknowns），以及下一步 3–5 条真实页面冒烟验证步骤；每条结论附带 `lastChecked` 核验日期与一手文档链接。

## 反模式

- ❌ 自家应用确定性 CI 回归测试明明原生 Playwright 更稳更省钱，却过度推荐重型 LLM Browser Agent。
- ❌ 把标为 `unknown` 的价格、许可证或反爬能力脑补为“免费”或“支持”。
- ❌ 用户要求 `local-session` 或 `self-host` 时，仍推荐纯云端或需上传凭据到云端密钥库的方案。
- ❌ 在商业场景推荐 `AGPL-3.0`（Skyvern）或 `SSPL-1.0`（Notte）却不提醒许可证合规风险。
- ❌ 把 Browserbase 等云浏览器基础设施混同为独立浏览器 Agent。

## 完成标准

- 已基于探测到的项目上下文与用户硬约束调用 `/api/recommend`（或显式说明采用离线核验快照）。
- 输出完整包含首选、备选、Why-Not 排除清单、Caveats 风险警示与下一步验证动作。
- 所有推荐项均标注 `lastChecked` 核验日期与一手文档来源，零凭空猜测。
