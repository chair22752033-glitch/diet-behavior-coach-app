# Intelligence Application Use Case Layer（TASK 1.61，Phase 3）

## 目的

在Phase 3建好的Application Service Boundary（TASK1.60）之上建立
Use Case Layer——本次**不是建立API，也不是建立UI，也不是導入
AI**，目的是定義未來User Application要如何使用Intelligence能力：
呼叫端只需要認識一個個具名的Application Scenario（例如「取得使用者
的Insight」），完全不需要知道Application Service/Facade/Execution
Manager/Orchestrator任何一層的內部細節。

**這個任務不是 AI 功能開發**：Use Case Layer只做三件事——定義
Application Scenario、組合Application Service呼叫、包裝Use Case
Result，完全不做任何推論、分類、摘要、建議。

## 架構位置

```
User Application
  ↓
Use Case Layer（這裡）
  ↓
Application Service（TASK1.60）
  ↓
Intelligence Facade（TASK1.48）
  ↓
Intelligence Runtime
```

`insight_use_case.js`完全不import`src/intelligence/facade/`、
`src/intelligence/execution/`、`src/intelligence/history/`、
`src/intelligence/metrics/`、`src/intelligence/events/`、
`src/intelligence/service/`、`src/intelligence/orchestration/`、
`src/intelligence/analysis/`、`src/intelligence/recommendation/`、
`src/intelligence/governance/`底下任何檔案——`applicationService`
一律是透過`createInsightUseCase({applicationService})`依賴注入
傳入的、符合最小介面（`{requestIntelligence}`）的不透明物件，這是
刻意的邊界決策，維持「每一層只認識自己呼叫的下一層」的既有慣例
（跟TASK1.60 `application_service.js`只認識Facade、不認識更底層的
Execution Manager/Service/Orchestrator是同一種設計，這裡再往上疊
一層）。

## 檔案

- `insight_use_case.js`：`createInsightUseCase(dependencies)`，
  提供`requestUserInsight(db, request)`——驗證輸入 → 呼叫
  `applicationService.requestIntelligence()`（唯一允許呼叫的下一
  層）→ 回傳穩定的use case結果格式。任何一步失敗都立刻回傳
  `{ok:false, useCase:'insight', reason}`，不會用不完整的資料頂替
  繼續執行。內建的`validateUseCaseRequest()`只檢查`userId`是否為
  非空字串、`options`（選填）是否為物件，不解讀業務內容，也不重用
  Application Service/Facade/Execution Contract的驗證函式（維持
  邊界獨立）。
- `use_case_result_builder.js`：`createUseCaseResultBuilder()`，
  提供`buildSuccessResult(useCase, applicationData)`（組出
  `{ok:true, useCase, data:{status, result, metadata}}`）跟
  `buildFailureResult(useCase, reason)`（組出
  `{ok:false, useCase, reason}`）。這個形狀看起來跟Application
  Service的回傳形狀一樣，只是多了一個`useCase`欄位標明是哪一個
  Application Scenario，而且是Use Case Layer自己獨立組裝出來的，
  不是直接轉傳Application Service的回傳值——未來如果Application
  Service的回傳形狀演進，只要這裡知道怎麼轉換，Use Case Result的
  形狀就可以保持不變。
- `index.js`：統一輸出上述兩個檔案的內容。

## 規則（Use Case Layer may call / must NOT call）

- ✅ 只能呼叫Application Service
  （`applicationService.requestIntelligence()`）。
- ❌ **不得**直接呼叫Intelligence Facade（規格明確禁止的捷徑，
  也是這一層存在的理由——維持「User Application → Use Case →
  Application Service → Facade」單向鏈，不允許Use Case跳過
  Application Service）。
- ❌ **不得**直接呼叫Execution Manager（規格明確禁止的捷徑
  「Use Case → Execution Manager」）。
- ❌ **不得**直接存取History Store、Metrics Store、Event
  Dispatcher。
- ❌ **不得**直接存取Database（規格明確禁止的捷徑
  「Use Case → Database」）——db只是原樣轉交給
  `applicationService.requestIntelligence()`的不透明參數。
- ❌ **不得**呼叫任何AI Provider/AI SDK（規格明確禁止的捷徑
  「Use Case → AI Provider」）——這一層完全不知道AI是什麼，AI只
  可能在更底層的Analysis/Recommendation Extension Point
  （`dependencies.modules`）被注入，跟Use Case Layer完全無關。
- ❌ **不得**繞過Application Service直接import Service/
  Orchestrator/Analysis/Recommendation/Data Preparation/
  Governance任何一層。
- ❌ **不得**import `src/services/`（既有Domain Service）。
- ❌ **不得**import `src/auth/`、`src/oauth/`、`src/identity/`、
  `src/middleware/`——userId一律由呼叫端當作request的欄位傳入，
  這裡完全不知道「目前是誰登入」這件事。
- ❌ **不知道**HTTP是什麼——不import任何路由/controller檔案。

## 合法流程 vs 禁止流程（規格原文）

**合法**：
```
User Application → Use Case Layer → Application Service
  → Intelligence Facade → Intelligence Runtime
```

**禁止**：
```
Use Case → Execution Manager   ❌
Use Case → Database             ❌
Use Case → AI Provider          ❌
```

## 目前狀態

- `src/intelligence/application/index.js` 新增
  `export * as useCases from './use_cases/index.js';`。
- `src/bootstrap/application.js` 新增
  `application.intelligence.useCases`，組裝
  `createInsightUseCase({applicationService})`實例——注入的是跟
  `intelligence.application`完全相同的Application Service實例
  （不是各自建立第二份）。純粹的依賴注入組裝，不影響
  `intelligence.application`/`intelligence.facade`/任何既有欄位
  的行為。
- Application Service、Facade、Service、Orchestrator、Analysis、
  Recommendation、Execution Manager、Governance八者的原始碼**完全
  沒有被修改**——本次任務明確禁止觸碰它們（Execution Runtime
  Behavior不變）。
- 完全沒有連接任何 route/controller/`worker.js`，也沒有新增任何
  API route——這是純粹的Phase 3 extension point，讓未來實際建立
  User Application時有一個現成、已測試過的具名Scenario入口可以
  呼叫。
