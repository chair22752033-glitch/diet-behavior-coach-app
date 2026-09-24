# Insight Feature Output Model（TASK 1.68，Phase 3）

## 目的

建立Phase 3 Insight Feature Output Model Boundary——本次**不是
建立API，也不是建立UI，也不是導入AI**，目的是建立Insight Domain
專屬的Output Model，把Runtime Result經由Insight Context Mapping
（TASK1.67）攤平後，轉換成穩定的Insight Feature Output。

**這個任務不是 AI 功能開發**：這兩個檔案只做結構性重新排列跟形狀
驗證（欄位是否存在），完全不解讀`context`/`analysis`/
`recommendation`各自內部的業務內容，不做任何推論/分類/摘要/建議/
計分。

## 架構位置

```
Insight Feature
  ↓
Insight Context Mapper（TASK1.67）
  ↓
Insight Output Mapper（這裡）
  ↓
Insight Domain Output
```

這個架構位置描述的是Output Mapper在整條鏈路裡「概念上」的合法
定位——跟TASK1.55 Governance Layer/TASK1.63 Contract Layer/
TASK1.67 Insight Context Layer的架構位置圖同樣的性質：這裡的兩個
檔案目前**沒有**透過import被實際串接進`insight_capability.js`
（TASK1.66）或`insight_context_mapper.js`（TASK1.67）的原始碼。
這裡是獨立、可驗證的轉換工具，用測試直接呼叫Insight Feature
Capability的真實輸出、經過Insight Context Mapper攤平、再餵給這裡
的Output Mapper，證明「Insight Feature事實上可以產生穩定的
Insight Domain Output」，而不是把既有、已通過測試的層重構成
import這個目錄——維持「建立但不改變既有execution behavior」這個
跟Governance/Contract/Insight Context Layer一致的邊界決策。

## 檔案

- `insight_output_model.js`：`InsightOutputModel`（規格：
  `status`/`context`/`analysis`/`recommendation`/`metadata`五個
  欄位，型別任意，因為這一層完全不解讀業務內容）跟
  `validateInsightOutput(output)`——驗證輸出物件是否具備這五個
  欄位，只驗證架構，不驗證細節。
- `insight_output_mapper.js`：`createInsightOutputMapper()`，提供
  `mapToInsightOutput(insightDomainView)`——接收TASK1.67
  `mapRuntimeContextToInsightDomain()`回傳的Insight Domain視圖
  （`{status, context, analysis, recommendation, metadata}`），
  重新組裝成`InsightOutputModel`定義的形狀，並用
  `validateInsightOutput()`驗證，回傳
  `{ok:true, output:{...}}`或`{ok:false, reason, field?}`。
- `index.js`：統一輸出上述兩個檔案的內容。

## 規則（Output Layer may call / must NOT call）

- ✅ 只處理已經從Insight Context Mapper（TASK1.67）拿到的
  `{status, context, analysis, recommendation, metadata}`資料，
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
Insight Feature → Insight Context Mapper → Insight Output Mapper
  → Insight Domain Output
```

**禁止**：
```
Insight Output → Database                      ❌
Insight Output → AI Provider                    ❌
Insight Output → Execution Internal Components  ❌
```

## 目前狀態

- `src/intelligence/application/features/insight/index.js` 新增
  `export * as output from './output/index.js';`。
- `src/bootstrap/application.js` 本次**不需要修改**——這兩個檔案
  是純函式映射/驗證工具（跟TASK1.47
  `src/intelligence/contracts/execution/`、TASK1.63
  `src/intelligence/application/contracts/`、TASK1.67
  `src/intelligence/application/features/insight/context/`同樣的
  角色），不是需要在`createApplication()`組裝的獨立子層實例，
  `intelligence`物件維持22個欄位不變。
- `insight_capability.js`/`insight_result_mapper.js`（TASK1.66）、
  `insight_context_mapper.js`/`insight_context_result_builder.js`
  （TASK1.67）、Workflow、Capability、Use Case、Application
  Service、Facade、Execution Manager的原始碼**完全沒有被修改**——
  各自唯一的相對路徑import維持不變，Execution Runtime Behavior
  不變。
- 測試直接呼叫Insight Feature Capability的真實函式（透過完整真實
  依賴鏈，一路到Analysis/Recommendation Runner），把真實產生的
  `data`先餵給Insight Context Mapper（TASK1.67）攤平、再餵給這裡
  的Output Mapper驗證，證明Runtime Result與Domain Output已經正式
  分離、Insight Feature事實上可以產生穩定的Insight Output。
