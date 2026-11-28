<div align="center">

<a href="https://skills.maoxunxing.com/">
  <img src="docs/social-preview.png" alt="ShipProof — Ship Verified. Zero Self-Grading." width="100%" />
</a>

<br />

# 🛡️ ShipProof

### **Ship Verified. Zero Self-Grading.**
**Independent 3-layer verification & high-quality delivery harness for AI Coding Agents — deterministic code/schema/PBT gates, real browser DOM proof, SHA-256 tamper-locked HTML acceptance reports, brownfield contract guards & 27 battle-tested skills.**

<p>
  <a href="https://skills.maoxunxing.com/">
    <img src="https://img.shields.io/badge/🛡️_Interactive_Verification_&_Delivery_Flow-skills.maoxunxing.com-6366f1?style=for-the-badge" alt="Interactive Workflow" />
  </a>
</p>

<p>
  <img src="https://img.shields.io/badge/Verification-3--Layer_Deep_Evaluator-22d3ee?style=flat-square" alt="3-Layer Deep Evaluator" />
  <img src="https://img.shields.io/badge/Skills-27_Delivery_Contracts-8b5cf6?style=flat-square" alt="27 Skills" />
  <img src="https://img.shields.io/badge/Antigravity-Supported-06b6d4?style=flat-square" alt="Antigravity" />
  <img src="https://img.shields.io/badge/Claude_Code-Supported-f59e0b?style=flat-square" alt="Claude Code" />
  <img src="https://img.shields.io/badge/Codex-Supported-10b981?style=flat-square" alt="Codex" />
  <img src="https://img.shields.io/badge/Cursor-Supported-ec4899?style=flat-square" alt="Cursor" />
</p>

**English** | [简体中文](./README.zh-CN.md) · [📖 Architecture Guide (`SPEC.md`)](./SPEC.md) · [🧾 Real Delivery Proof (`HTML`)](./examples/visual-studio-acceptance-report.html) · [🌐 Interactive Visual Workflow](https://skills.maoxunxing.com/) · [🧠 Prompt Studio](https://prompts.maoxunxing.com/) · [🚀 Full Playbook & 1v1 Setup](https://maoxunxing.com/zh-cn/consult/)

</div>

---

## 🔥 Why 90% of AI-Built SaaS Projects Stall Halfway

| | ❌ Traditional Vibe Coding (Chat & Pray) | 🛡️ With **ShipProof** Installed |
| :--- | :--- | :--- |
| **Before Coding** | Jumps straight into code in 10 seconds, builds the wrong thing for 6 hours | **`challenge-and-plan`**: challenges assumptions, asks 3 sharp questions, gives 3 trade-off options first |
| **During Execution** | Breaks working features, mixes unrelated refactors, forgets rules by turn 5 | **Isolated worktrees + state-schema-first**: clean atomic commits, ~95% rule retention |
| **Quality & Proof** | AI grades its own homework and says *"all tests pass!"* while the page is broken | **Deterministic verification**: real build/lint/test exit codes + real browser screenshots + standalone HTML acceptance report |
| **Bug Fixes** | Slaps `if (!x) return` band-aids on symptoms; same bug returns next week | **`bug-root-cause` + `systematic-debugging`**: reproduces first, fixes upstream root cause, locks in regression guards |

---

## 🌐 Live 4-Host Interactive Workflow

**Click the preview below to launch the interactive animated workflow & live 4-host theater at [skills.maoxunxing.com](https://skills.maoxunxing.com/) →**

<a href="https://skills.maoxunxing.com/#workflow">
  <img src="docs/workflow-preview.png" alt="Interactive 4-Host Animated Workflow on skills.maoxunxing.com" width="100%" />
</a>

> **Human-in-the-Loop, Zero Micromanagement:** You only step in at 3 high-leverage checkpoints — **① Approve the plan → ② Review the HTML acceptance report & merge PR → ③ Report bugs / new features**. Everything in between runs autonomously, automatically adapting to your host's native superpowers (**Antigravity Swarm & Browser**, **Claude Code Subagents & Worktree**, **Codex Sandbox**, **Cursor Agent Mode**).

---

## 📋 Step-by-Step Workflow & Concrete Deliverables (Step 1 → Step 4)

Every stage in ShipProof has a **fixed role boundary** and produces **verifiable disk artifacts** — never vague chat summaries:

| Step | Stage & Role | What It Does | Concrete Deliverable Artifacts |
| :--- | :--- | :--- | :--- |
| **Step 1** | **Plan & Contract**<br/>`clarify` · Planner + 👤 You | Challenges assumptions, asks sharp clarifying questions, proposes 3 trade-off options. For greenfield UI, scouts live references into clickable prototypes (`ui-variants-studio`); for brownfield repos, locks data/UI redlines (`brownfield-contract`). Freezes the contract & acceptance rubric before any code is written. | • `.harness/tasks/<f>/clarification/` (`questions.md` / `answers.md` / `summary.md`)<br/>• `prd.md` (`REQ-n` contract) + `vision.md` (`REF / ANTI / RL` quality anchors)<br/>• `tech-design.md` + `pages.json` + `tasks.json` + `plan.md` (editable scope)<br/>• `rubric.json` (layered gates + veto rules) + `e2e-cases.json`<br/>• *(Optional)* 3–5 clickable HTML UI prototypes or `brownfield-contract.md` |
| **Step 2** | **Isolated Build**<br/>`implement` · Developer 🤖 | Executes `tasks.json` one atomic task at a time inside an isolated `git worktree` / branch. Role-whitelist isolation prevents the developer from seeing `rubric.json` grading details so it builds to spec rather than gaming tests. | • Atomic commits per task on an isolated branch (e.g., `TASK-1` … `TASK-6`)<br/>• Production code + unit / API integration / Playwright E2E test suites<br/>• `.harness/tasks/<f>/state.json` (crash-safe disk state machine with task SHAs for instant resume) |
| **Step 3** | **3-Layer Verification & Remediation**<br/>`evaluate → review → verify` · Evaluator + Reviewer 🤖 | Independent agents (blind to developer notes) run deterministic code/data/logic/PBT checks (Layer 1) and real browser walkthrough + computed-style DOM audit + SHA-256 tamper locks (Layer 2). Any `fail` or veto triggers `replan → remediate`; passing triggers a fresh-context 2nd confirmation (`2/2`). | • `.harness/verify.json` (real build/lint/test exit codes bound to Git `HEAD`)<br/>• `evaluation/report-*.json` (3-state verdicts, L1–L4 scores, veto log)<br/>• `review/report.json` + desktop/mobile real browser screenshots (SHA-256 bound)<br/>• Targeted remediation commits (e.g., `fix(RB-27)`) |
| **Step 4** | **30-Second Sign-Off, Ship & Learn**<br/>`done` · 👤 You + Memory | Bundles all Layer 1 & Layer 2 proof into a single offline, double-clickable HTML acceptance report. You review metrics, screenshots, and the sign-off checklist in 30 seconds and merge. Post-merge updates long-term memory and turns past failures into permanent guardrails. | • **Standalone Offline HTML Acceptance Report** (see real example below)<br/>• `harness report <f>` summary + clean PR / merge<br/>• Updated `.harness/overview/` (`sync-overview`) & `.harness/project-rules.json` (`fh learn`) |

### 🧾 Real-World Delivery Proof Example (`Visual Studio`)

Below is an **actual Step 4 offline acceptance report** generated by ShipProof on a real project ([`examples/visual-studio-acceptance-report.html`](./examples/visual-studio-acceptance-report.html) — download and double-click to inspect locally with interactive lightbox zoom):

<a href="./examples/visual-studio-acceptance-report.html">
  <img src="docs/acceptance-report-preview.png" alt="Real ShipProof Offline HTML Acceptance Report — Visual Studio (Score 0.978, 72/72 Unit & API Tests, 9/9 E2E, 10 Embedded Browser Screenshots)" width="100%" />
</a>

- **Verdict**: `PHASE: DONE` · **`2/2`** fresh-context confirmation passes · **Score `0.978`** (L1 `1.0` / L2 `1.0` / L3 `1.0` / L4 `0.85`) · **0 Vetoes**
- **Automated Proof**: **`72 / 72`** unit & API integration tests + **`9 / 9`** Playwright E2E journeys + **`0 files`** touched in the legacy repo
- **Visual & Audit Evidence**: **10 Base64-embedded real browser screenshots** (Light/Dark, CN/EN, Desktop `1280×800` & Mobile `390×844`, modals/drawers/popovers), 30-second human sign-off checklist, raw `harness report`, and full atomic `git log` (`TASK-1`–`TASK-6` + `RB-27` remediation).

---

## 🛡️ Three-Layer Automated Verification & v0.13 Deep Evaluator

**95% of QA runs autonomously with zero self-grading — you only spend 30 seconds signing off the standalone HTML proof.**

<a href="https://skills.maoxunxing.com/#verification">
  <img src="docs/verification-preview.png" alt="Three-Layer Intelligent Automated Verification on skills.maoxunxing.com" width="100%" />
</a>

- **Layer 1 · Deterministic Code, Data & Logic Engine (`src/gate/rules/`)**
  - **Data completeness & brownfield mutability**: tracks whether declared TS fields are actually **consumed** in runtime code (`data-spec-field-unconsumed`), enforces `frozen` & `additive-only` brownfield protocol redlines, and validates live HTTP responses (`inputs.apiContractResults`).
  - **Executable Logic Spec + Property-Based Testing**: replaces comment-only checks with real passing test bindings (`inputs.logicSpec` + Jest/Vitest/Playwright `testResults`), state-machine enum & transition coverage, and `fast-check` PBT verification.
- **Layer 2 · Real Browser Walkthrough + DOM Audit**
  - Runs interactive journeys in a fresh context (`interactive-review`), audits computed layout (`inputs.domAuditResults`: horizontal overflow, clipped/overlapping elements, font scale drift, opt-in Tailwind arbitrary escapes), and binds every artifact to its **SHA-256** hash so nothing can be tampered with post-review.
- **Layer 3 · 30-Second Human Sign-Off**
  - Subjective taste (`verify: "human"`) and production merges always belong to you — delivered via an offline, double-clickable HTML acceptance report.

> 📖 **Curious *why* we designed veto-over-averages, three-state verdicts, SHA-256 tamper locks, and greenfield vs. brownfield separation — and *how* every module works under the hood?** Read the full beginner-friendly architecture guide in **[`SPEC.md`](./SPEC.md)** →

---

## ⚡ How It Adapts to Your AI Coding Tool (Isolation Boundaries)

| Host Environment | Skills Directory | Isolation Mechanism | Optional Power Switches |
| :--- | :--- | :--- | :--- |
| **Antigravity** | `.agents/skills/` | Dynamic **Swarm** multi-agent board + sandboxed **Browser** subagent | `/goal` (overnight), `/grill-me`, `/boost`, `/schedule` |
| **Claude Code** | `.claude/skills/` | Static 4 role subagents (`.claude/agents/*.md`) + `git worktree` | `/plan` (`Shift+Tab`), `/compact`, `/loop` |
| **Codex** | `.agents/skills/` | Isolated branch/worktree execution + deterministic build & test gates | Background multi-step execution |
| **Cursor** | `.agents/skills/` | Agent Mode constraint enforcement + branch isolation + terminal/MCP checks | Plan / Ask mode for Step 01 |

---

## 📦 27 Battle-Tested Skills (Outcome-First)

Every Skill is an **executable deliverable contract** — not vague advice. Includes **3-Layer Automated Verification** (deterministic commands + real browser interactive SHA-bound walkthrough + 30s human sign-off), **Brownfield Contract Guard** (`templates/standards/brownfield-contract.md`), and **`ui-variants-studio`** (live GitHub / `shadcn` / `21st.dev` scouting → 3–5 clickable HTML prototypes before coding). Explore free copy-ready templates at **[skills.maoxunxing.com](https://skills.maoxunxing.com/#skills)**:

- **Meta Workflows (5)**: `challenge-and-plan` · `ui-variants-studio` · `autonomous-delivery-proof` · `codebase-archaeology-audit` · `repo-community-patrol`
- **Specs & Contracts (6)**: `clarify-requirements` · `write-prd` · `write-quality-vision` · `write-tech-design` · `write-dev-plan` · `write-acceptance-criteria`
- **Implementation & Debugging (3)**: `implement-task` · `systematic-debugging` · `fix-from-report`
- **Deterministic Eval & Review (4)**: `deterministic-eval` · `e2e-testing` · `api-testing` · `interactive-review`
- **Ship Gates & Memory (2)**: `ship-checklist` · `sync-overview`
- **Frontend Craft (7)**: `context-map` · `plan-before-code` · `state-schema-first` · `component-from-design` · `i18n-extract` · `bug-root-cause` · `verification-before-completion`

---

## 🚀 Get Started in 60 Seconds

1. **Explore the visual workflow & copy free sample Skills**: 👉 **[https://skills.maoxunxing.com](https://skills.maoxunxing.com/)**
2. **Try the Bilingual AI Prompt Studio (35 free + 20 original PRO SOPs)**: 👉 **[https://prompts.maoxunxing.com](https://prompts.maoxunxing.com/)**
3. **Want the complete curated Notion workspace + 1v1 repo setup?** 👉 **[https://maoxunxing.com/zh-cn/consult/](https://maoxunxing.com/zh-cn/consult/)**

<details>
<summary><strong>🛠️ Advanced: CLI Kernel & Local Repo Installation</strong></summary>

```bash
git clone https://github.com/XingMXTeam/ShipProof.git
cd ShipProof && npm install
```

See the full architecture notes at [maoxunxing.com/en/frontend-ai-collaboration-design/](https://maoxunxing.com/en/frontend-ai-collaboration-design/).

</details>

---

<div align="center">
  <strong>Built by <a href="https://maoxunxing.com/">Momo (@maoxunxing)</a></strong> · Former NetEase &amp; Alibaba Senior Frontend Engineer (11 yrs) · Indie Maker
  <br />
  If this helps you ship cleaner SaaS faster, drop a ⭐ on this repo!
</div>
