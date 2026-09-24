# Intelligence Application Service Layer（TASK 1.60，Phase 3）

## 目的

在Phase 2建好的Intelligence Facade（TASK1.48）跟未來的User
Application（Phase 3規劃、TASK1.59已定義邊界，目前尚未建立）之間
建立一個application-facing的服務邊界——本次**不是導入AI功能，也
不是建立User API**，目的是讓未來User Application可以透過一個穩定
入口使用Intelligence能力，而不需要直接認識Facade/Service/
Execution Manager/Orchestrator/Analysis/Recommendation任何一層的
內部細節。

**這個任務不是 AI 功能開發**：Application Service只做四件事——
接收application request、驗證application input、呼叫Intelligence
Facade、包裝application response，完全不做任何推論、分類、摘要、
建議。

## 架構位置

```
Application Service（這裡）
  ↓
Intelligence Facade（TASK1.48）
  ↓
Intelligence Service（TASK1.46）
  ↓
Execution Runtime（Execution Manager，TASK1.50）
  ↓
Analysis / Recommendation（TASK1.43/1.44）
```

`application_service.js`完全不import
`src/intelligence/execution/`、`src/intelligence/history/`、
`src/intelligence/metrics/`、`src/intelligence/events/`、
`src/intelligence/service/`、`src/intelligence/orchestration/`、
`src/intelligence/analysis/`、`src/intelligence/recommendation/`、
`src/intelligence/governance/`底下任何檔案——`facade`一律是透過
`createApplicationService({facade})`依賴注入傳入的、符合最小介面
（`{executeIntelligence}`）的不透明物件，這是刻意的邊界決策，維持
「每一層只認識自己呼叫的下一層」的既有慣例（跟TASK1.48
`intelligence_facade.js`只認識Execution Manager、不認識更底層的
Service/Orchestrator是同一種設計）。

## 檔案

- `application_service.js`：`createApplicationService(dependencies)`，
  提供`requestIntelligence(db, request)`——驗證輸入 → 呼叫
  `facade.executeIntelligence()`（唯一允許呼叫的下一層）→ 回傳
  穩定的application結果格式。任何一步失敗都立刻回傳
  `{ok:false, reason}`，不會用不完整的資料頂替繼續執行。內建的
  `validateApplicationRequest()`只檢查`userId`是否為非空字串、
  `options`（選填）是否為物件，不解讀業務內容，也不重用Facade/
  Execution Contract的驗證函式（維持邊界獨立）。
- `application_result_builder.js`：`createApplicationResultBuilder()`，
  提供`buildSuccessResult(facadeData)`（組出
  `{ok:true, data:{status, result, metadata}}`）跟
  `buildFailureResult(reason)`（組出`{ok:false, reason}`）。這個
  形狀看起來跟Facade的回傳形狀一樣，但是Application Service自己
  獨立組裝出來的，不是直接轉傳Facade的回傳值——未來如果Facade的
  回傳形狀演進，只要這裡知道怎麼轉換，Application Result的形狀
  就可以保持不變。
- `index.js`：統一輸出上述兩個檔案的內容。

## 規則（Application Service may call / must NOT call）

- ✅ 只能呼叫Intelligence Facade（`facade.executeIntelligence()`）。
- ❌ **不得**直接呼叫Execution Manager（規格明確禁止的捷徑
  「Application Service → Execution Manager」）。
- ❌ **不得**直接存取History Store、Metrics Store、Event
  Dispatcher。
- ❌ **不得**直接存取Database（規格明確禁止的捷徑
  「Application Service → Database」）——db只是原樣轉交給
  `facade.executeIntelligence()`的不透明參數。
- ❌ **不得**呼叫任何AI Provider/AI SDK（規格明確禁止的捷徑
  「Application Service → AI Provider」）——這一層完全不知道AI是
  什麼，AI只可能在更底層的Analysis/Recommendation Extension
  Point（`dependencies.modules`）被注入，跟Application Service
  完全無關。
- ❌ **不得**繞過Facade直接import Service/Orchestrator/Analysis/
  Recommendation/Data Preparation/Governance任何一層。
- ❌ **不得**import `src/services/`（既有Domain Service）。
- ❌ **不得**import `src/auth/`、`src/oauth/`、`src/identity/`、
  `src/middleware/`——userId一律由呼叫端當作request的欄位傳入，
  這裡完全不知道「目前是誰登入」這件事。
- ❌ **不知道**HTTP是什麼——不import任何路由/controller檔案。

## 合法流程 vs 禁止流程（規格原文）

**合法**：
```
Application Service → Intelligence Facade → Intelligence Service
  → Execution Runtime → Analysis / Recommendation
```

**禁止**：
```
Application Service → Execution Manager   ❌
Application Service → Database             ❌
Application Service → AI Provider          ❌
```

## 目前狀態

- `src/intelligence/index.js` 新增 `application` namespace
  re-export。
- `src/bootstrap/application.js` 新增
  `application.intelligence.application`，組裝
  `createApplicationService({facade})`實例——注入的是跟
  `intelligence.facade`完全相同的Facade實例（不是各自建立第二
  份）。純粹的依賴注入組裝，不影響`intelligence.facade`/
  `intelligence.execution`/任何既有欄位的行為。
- Facade、Service、Orchestrator、Analysis、Recommendation、
  Execution Manager、Governance七者的原始碼**完全沒有被修改**——
  本次任務明確禁止觸碰它們（Execution Runtime Behavior不變）。
- 完全沒有連接任何 route/controller/`worker.js`，也沒有新增任何
  API route——這是純粹的Phase 3 extension point，讓未來實際建立
  User Application時有一個現成、已測試過的穩定入口可以呼叫。
