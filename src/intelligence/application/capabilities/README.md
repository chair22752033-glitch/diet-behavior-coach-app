# Intelligence Application Capability Layer（TASK 1.62，Phase 3）

## 目的

在Phase 3建好的Use Case Layer（TASK1.61）之上建立Capability
Layer——本次**不是建立API，也不是建立UI，也不是導入AI**，目的是
讓未來不同的Intelligence Application能力（例如Insight、未來可能
新增的其他能力）可以被清楚分類與管理：呼叫端只需要認識一個個具名的
Capability entry point，完全不需要知道底下實際上串接的是哪一個
Use Case、Application Service、Facade。

**這個任務不是 AI 功能開發**：Capability Layer只做三件事——定義
Intelligence Application能力分類、組合對應Use Case、提供穩定
capability entry point，完全不做任何推論、分類、摘要、建議。

## 架構位置

```
User Application
  ↓
Capability Layer（這裡）
  ↓
Use Case Layer（TASK1.61）
  ↓
Application Service（TASK1.60）
  ↓
Intelligence Facade（TASK1.48）
  ↓
Intelligence Runtime
```

`insight_capability.js`完全不import
`src/intelligence/application/application_service.js`、
`src/intelligence/facade/`、`src/intelligence/execution/`、
`src/intelligence/history/`、`src/intelligence/metrics/`、
`src/intelligence/events/`、`src/intelligence/service/`、
`src/intelligence/orchestration/`、`src/intelligence/analysis/`、
`src/intelligence/recommendation/`、
`src/intelligence/governance/`底下任何檔案——`useCase`一律是透過
`createInsightCapability({useCase})`依賴注入傳入的、符合最小介面
（`{requestUserInsight}`）的不透明物件，這是刻意的邊界決策，維持
「每一層只認識自己呼叫的下一層」的既有慣例（跟TASK1.61
`insight_use_case.js`只認識Application Service、不認識更底層的
Facade/Execution Manager/Service/Orchestrator是同一種設計，這裡再
往上疊一層）。

## 檔案

- `insight_capability.js`：`createInsightCapability(dependencies)`，
  提供`requestInsightCapability(db, request)`——驗證輸入 → 呼叫
  `useCase.requestUserInsight()`（唯一允許呼叫的下一層）→ 回傳
  穩定的capability結果格式。任何一步失敗都立刻回傳
  `{ok:false, capability:'insight', reason}`，不會用不完整的資料
  頂替繼續執行。內建的`validateCapabilityRequest()`只檢查`userId`
  是否為非空字串、`options`（選填）是否為物件，不解讀業務內容，也
  不重用Use Case Layer/Application Service/Facade/Execution
  Contract的驗證函式（維持邊界獨立）。
- `capability_result_builder.js`：`createCapabilityResultBuilder()`，
  提供`buildSuccessResult(capability, useCaseData)`（組出
  `{ok:true, capability, data:{status, result, metadata}}`）跟
  `buildFailureResult(capability, reason)`（組出
  `{ok:false, capability, reason}`）。這個形狀看起來跟Use Case
  Layer的回傳形狀一樣，只是把`useCase`欄位換成`capability`欄位
  標明是哪一個能力分類，而且是Capability Layer自己獨立組裝出來
  的，不是直接轉傳Use Case Layer的回傳值——未來如果Use Case Layer
  的回傳形狀演進，只要這裡知道怎麼轉換，Capability Result的形狀
  就可以保持不變。
- `index.js`：統一輸出上述兩個檔案的內容。

## 規則（Capability Layer may call / must NOT call）

- ✅ 只能呼叫對應的Use Case（`useCase.requestUserInsight()`）。
- ❌ **不得**直接呼叫Application Service（規格明確禁止的捷徑，也
  是這一層存在的理由——維持「User Application → Capability →
  Use Case → Application Service」單向鏈，不允許Capability跳過
  Use Case Layer）。
- ❌ **不得**直接呼叫Intelligence Facade。
- ❌ **不得**直接呼叫Execution Manager（規格明確禁止的捷徑
  「Capability → Execution Manager」）。
- ❌ **不得**直接存取History Store、Metrics Store、Event
  Dispatcher。
- ❌ **不得**直接存取Database（規格明確禁止的捷徑
  「Capability → Database」）——db只是原樣轉交給
  `useCase.requestUserInsight()`的不透明參數。
- ❌ **不得**呼叫任何AI Provider/AI SDK（規格明確禁止的捷徑
  「Capability → AI Provider」）——這一層完全不知道AI是什麼，AI
  只可能在更底層的Analysis/Recommendation Extension Point
  （`dependencies.modules`）被注入，跟Capability Layer完全無關。
- ❌ **不得**繞過Use Case Layer直接import Application Service/
  Facade/Service/Orchestrator/Analysis/Recommendation/Data
  Preparation/Governance任何一層。
- ❌ **不得**import `src/services/`（既有Domain Service）。
- ❌ **不得**import `src/auth/`、`src/oauth/`、`src/identity/`、
  `src/middleware/`——userId一律由呼叫端當作request的欄位傳入，
  這裡完全不知道「目前是誰登入」這件事。
- ❌ **不知道**HTTP是什麼——不import任何路由/controller檔案。

## 合法流程 vs 禁止流程（規格原文）

**合法**：
```
User Application → Capability Layer → Use Case Layer
  → Application Service → Intelligence Facade → Intelligence Runtime
```

**禁止**：
```
Capability → Execution Manager   ❌
Capability → Database             ❌
Capability → AI Provider          ❌
```

## 目前狀態

- `src/intelligence/application/index.js` 新增
  `export * as capabilities from './capabilities/index.js';`。
- `src/bootstrap/application.js` 新增
  `application.intelligence.capabilities`，組裝
  `createInsightCapability({useCase})`實例——注入的是跟
  `intelligence.useCases`完全相同的Insight Use Case實例（不是各自
  建立第二份）。純粹的依賴注入組裝，不影響`intelligence.useCases`/
  `intelligence.application`/`intelligence.facade`/任何既有欄位
  的行為。
- Use Case Layer、Application Service、Facade、Service、
  Orchestrator、Analysis、Recommendation、Execution Manager、
  Governance九者的原始碼**完全沒有被修改**——本次任務明確禁止觸碰
  它們（Execution Runtime Behavior不變）。
- 完全沒有連接任何 route/controller/`worker.js`，也沒有新增任何
  API route——這是純粹的Phase 3 extension point，讓未來實際建立
  User Application時有一個現成、已測試過的具名Capability入口可以
  呼叫，也讓未來新增其他Intelligence Application能力時有清楚的
  分類慣例可以依循。
