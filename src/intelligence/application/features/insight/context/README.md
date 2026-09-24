# Insight Feature Context Integration（TASK 1.67，Phase 3）

## 目的

建立Phase 3 Insight Feature（TASK1.66）與Intelligence Runtime
Context（Phase 2：Data Preparation/Insight Context/Analysis
Framework/Recommendation Framework/Intelligence Runtime）的整合
邊界——本次**不是建立API，也不是建立UI，也不是導入AI**，目的是讓
Insight Domain Feature可以正確消費Phase 2已建立的Intelligence
Context與Runtime Result，驗證Application Layer與Runtime Layer的
正式串接。

**這個任務不是 AI 功能開發**：這兩個檔案只做結構性重新排列（把
`result.context`/`result.analysis`/`result.recommendation`攤平成
頂層欄位），完全不解讀`context`/`analysis`/`recommendation`各自
內部的業務內容，不做任何推論/分類/摘要/建議/計分。

## 跟前面幾層的關鍵差異：第一個真正打開`result`的層

TASK1.60（Application Service）~ TASK1.66（Insight Feature
Capability）每一層的result builder都只是把Facade
（TASK1.48）組出來的`result`（`{context, analysis,
recommendation}`）當作**不透明物件**原封不動往上傳——
`const {status, result, metadata} = data`，從來沒有解構`result`
內部。這是Phase 3第一個**真正打開**`result`、讀取
`context`/`analysis`/`recommendation`三個欄位值的層，目的是把它們
攤平成Insight Domain可以直接讀取的格式，不需要再透過`result`這個
中繼容器——但仍然只做「結構性重新排列」，不做任何業務解讀，跟
`facade_result_builder.js`當初把三個欄位「收斂進result」是同一種
「重新包裝，不重新解讀」的邊界決策，只是方向相反（這裡是攤平）。

## 架構位置

```
Insight Feature
  ↓
Insight Context Mapper（這裡）
  ↓
Workflow
  ↓
Application Service
  ↓
Intelligence Facade
  ↓
Runtime Context
```

這個架構位置描述的是Context Mapper在整條鏈路裡「概念上」的合法
定位——跟TASK1.55 Governance Layer/TASK1.63 Contract Layer的架構
位置圖同樣的性質：這裡的兩個檔案目前**沒有**透過import被實際串接
進`insight_capability.js`（TASK1.66）的原始碼，`insight_capability.js`
唯一的相對路徑import維持是`./insight_result_mapper.js`不變。這裡
定義的mapper/result builder是一份**獨立、可驗證的映射工具**，用
測試直接呼叫`insight_capability.js`的真實輸出、把它餵給這裡的
mapper，藉此證明「Insight Feature事實上可以消費Runtime Context」，
而不是把已經各自通過測試的既有層重構成import這個目錄——維持
「建立但不改變既有execution behavior」這個跟Governance/Contract
Layer一致的邊界決策。

## 檔案

- `insight_context_mapper.js`：`createInsightContextMapper()`，
  提供`mapRuntimeContextToInsightDomain(workflowData)`——接收
  `{status, result, metadata}`形狀的物件（Insight Feature
  Capability/Workflow/Capability/Use Case/Application Service/
  Facade任何一層成功時回傳的`data`欄位都符合這個形狀），攤平成
  `{status, context, analysis, recommendation, metadata}`——
  `context`/`analysis`/`recommendation`不再需要透過`result`這個
  中繼容器，直接是頂層欄位。只做結構性重新排列，不解讀各欄位的
  內部業務內容。
- `insight_context_result_builder.js`：
  `createInsightContextResultBuilder()`，提供
  `buildSuccessResult(insightDomainView)`（組出
  `{ok:true, feature:'insight', data:{status, context, analysis,
  recommendation, metadata}}`）跟`buildFailureResult(reason)`
  （組出`{ok:false, feature:'insight', reason}`）。這是「統一
  Insight Feature output mapping」的具體落地——跟TASK1.66
  `insight_result_mapper.js`的形狀不完全相同（那裡`data`保留
  `result`巢狀容器），這裡是Insight Domain專屬的、已經攤平、跟
  Runtime內部怎麼收斂資料無關的最終輸出格式。
- `index.js`：統一輸出上述兩個檔案的內容。

## 規則（Insight Context Layer may call / must NOT call）

- ✅ 只處理已經從Workflow/Capability/Use Case/Application
  Service/Facade任何一層拿到的`{status, result, metadata}`資料，
  純函式轉換，不主動呼叫任何其他層。
- ❌ **不得**直接存取Database（不import `src/db/`底下任何檔案）。
- ❌ **不得**直接處理Authentication（不import `src/auth/`、
  `src/oauth/`、`src/identity/`、`src/middleware/`）。
- ❌ **不得**直接操作Execution Manager、History Store、Metrics
  Store、Event Dispatcher（不import
  `src/intelligence/execution/`、`src/intelligence/history/`、
  `src/intelligence/metrics/`、`src/intelligence/events/`底下任何
  檔案）。
- ❌ **不得**呼叫任何AI Provider/AI SDK。

## 合法流程 vs 禁止流程（規格原文）

**合法**：
```
Insight Feature → Insight Context Mapper → Workflow
  → Application Service → Intelligence Facade → Runtime Context
```

**禁止**：
```
Insight Domain → Database                      ❌
Insight Domain → AI Provider                    ❌
Insight Domain → Execution Internal Components  ❌
```

## 目前狀態

- `src/intelligence/application/features/insight/index.js` 新增
  `export * as context from './context/index.js';`。
- `src/bootstrap/application.js` 本次**不需要修改**——這兩個檔案
  是純函式映射工具（跟TASK1.47
  `src/intelligence/contracts/execution/`、TASK1.63
  `src/intelligence/application/contracts/`同樣的角色），不是需要
  在`createApplication()`組裝的獨立子層實例，`intelligence`物件
  維持22個欄位不變。
- `insight_capability.js`（TASK1.66）、`insight_result_mapper.js`
  （TASK1.66）、Workflow、Capability、Use Case、Application
  Service、Facade、Execution Manager的原始碼**完全沒有被修改**——
  各自唯一的相對路徑import維持不變，Execution Runtime Behavior
  不變。
- 測試直接呼叫Insight Feature Capability的真實函式（透過完整
  真實依賴鏈，一路到Analysis/Recommendation Runner），把真實產生
  的`data`餵給這裡的mapper/result builder驗證，證明Phase 2
  Runtime與Phase 3 Application Layer事實上已經正式接通、Insight
  Feature事實上可以消費Runtime Context。
