# Brownfield Repository Contract (Incremental Guard)

Copy to `.harness/brownfield-contract.md` (or link from `AGENTS.md`) when working inside an **existing production codebase**. Do NOT rewrite facts that source code already proves — point to source files as the primary source of truth, and record ONLY the change redlines and reuse rules that code alone cannot tell an agent.

## 1. Data & Gateway Protocol Redlines

- **Primary schema source of truth**: `<path to OpenAPI / GraphQL / Protobuf / src/types/dto.ts>`
- **Gateway envelope convention**:
  - Response wrapper: e.g. `{ code: number, message: string, data: T, requestId?: string }`
  - Pagination shape: e.g. `{ items: T[], nextCursor?: string, total?: number }`
  - Error handling: `401` → auth redirect; `403` → permission boundary UI; `422` → field-level form errors
  - Time & money units: e.g. ISO-8601 UTC strings; money in integer minor units (cents/fen)
- **Field mutability tiers**:
  - `frozen` (**never rename, remove, or change type**): database primary keys, billing/permission fields, public webhook payloads, persisted `localStorage` keys (`<list paths/fields>`)
  - `additive-only` (**optional additions only; never break existing fields**): existing backend API responses & shared DTOs
  - `free` (**safe to evolve**): new feature-local UI state & internal view models

## 2. UI Library & Reuse Policy (Brownfield: Reuse > Reinvent)

- **Approved UI library whitelist**: e.g. `@corp/ui` or `shadcn/ui` (`components/ui/*`). **Forbidden**: installing a second UI framework or hand-rolling existing primitives (Button, Modal, Select, Table, Toast).
- **Mandatory business component reuse table**:
  | Need | Existing Component | Path |
  | :--- | :--- | :--- |
  | User selector | `<UserPicker />` | `src/components/UserPicker.tsx` |
  | Currency display | `<MoneyText />` | `src/components/MoneyText.tsx` |
- **Design token source**: `<path to tokens.css / tailwind.config.*>`
- **Visual benchmark page**: New pages MUST match `<src/pages/modern-benchmark/>` — do **NOT** copy legacy styling from `<src/pages/legacy-old/>`.
