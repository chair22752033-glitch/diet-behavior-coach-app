# Feature Intelligence Capability Integration Foundation（Phase 4 TASK1.79）

## 目的

建立Phase 4 Capability跟Phase 3 Feature Layer之間**正式的整合
邊界**——本次**不是**導入AI、**不是**建立AI Provider、**不是**
修改Feature Pattern，目的是讓Feature可以透過明確的Capability
Boundary使用TASK1.76 Analysis Capability + TASK1.77 Recommendation
Capability + TASK1.78 Capability Orchestration這一整套Phase 4能力，
而不需要自己手動組裝這三層。

這是Phase 4系列（TASK1.75規劃 → TASK1.76 Analysis Capability →
TASK1.77 Recommendation Capability → TASK1.78 Capability
Orchestration）最後一塊拼圖：把已經組裝好的Capability Flow正式
接上Feature層級的入口。

## 架構位置

```
Feature Request
  ↓
Intelligence Feature Integration（這裡）
  ↓
Capability Orchestrator（TASK1.78，完全不修改）
  ↓
Analysis Capability（TASK1.76，完全不修改）
  ↓
Recommendation Capability（TASK1.77，完全不修改）
  ↓
Output
```

## 跟Insight/Behavior Feature的差異

`../insight/insight_feature.js`（TASK1.66）跟`../behavior/
behavior_feature.js`（TASK1.72）走的是Phase 3既有的Application
Pattern：

```
Feature → Workflow → Capability → Use Case → Application Service → Runtime
```

這裡的Intelligence Feature走的是規格明確畫出的**另一條完全平行、
互不交叉**的路徑，直接呼叫Phase 4的Capability
Orchestrator，完全不經過Workflow/Use Case/Application
Service。這不是「修改」既有Insight/Behavior Feature的鏈路——兩者
本身完全沒有被修改，仍然只認識Workflow這一層；這是為Phase 4
Capability這一整套（原本就已經跟Workflow/UseCase/
ApplicationService平行存在、互不認識）新增一個對應的Feature層級
入口。

## 檔案

- `intelligence_feature.js`：
  `createIntelligenceFeature({capabilityOrchestrator})`，提供
  `requestIntelligence(request)`——驗證輸入（`request.context`是否
  為物件、`request.options`選填是否為物件，跟Capability
  Orchestrator的request形狀完全相同）→ 呼叫
  `capabilityOrchestrator.requestCapabilityFlow()`（唯一允許呼叫
  的下一層）→ 用`intelligence_feature_result_mapper.js`統一轉換
  結果。任何一步失敗都立刻回傳
  `{ok:false, feature:'intelligence', reason, field?, stage?}`。
  這是同步函式，跟Capability Orchestrator本身的同步簽名完全一致
  ——因為整條鏈路（Capability Orchestrator/Analysis
  Capability/Recommendation Capability/Analysis Runner/
  Recommendation Runner）從頭到尾都不接觸database/auth，天生就是
  純函式、同步的，這裡忠實反映底層鏈路本身的簽名，跟`../behavior/
  behavior_feature.js`需要`db`參數、回傳Promise的async設計不同。
- `intelligence_feature_result_mapper.js`：
  `createIntelligenceFeatureResultMapper()`，提供
  `mapSuccessResult(capabilityResult)`（組出
  `{ok:true, feature:'intelligence', data:{analysis, recommendation}}`，
  `data`欄位保留Capability Orchestrator原本的nested形狀不重新拆開
  合併）跟`mapFailureResult(reason, field?, stage?)`（組出
  `{ok:false, feature:'intelligence', reason, field?, stage?}`）。
- `index.js`：統一輸出上述兩個檔案的內容。
- `README.md`：本檔案。

## 規則（Intelligence Feature may call / must NOT call）

- ✅ 只能呼叫Capability
  Orchestrator（`capabilityOrchestrator.requestCapabilityFlow()`）。
- ❌ **不得**繞過Capability Orchestrator直接呼叫Analysis
  Capability/Recommendation Capability（不import
  `capabilities/analysis/`、`capabilities/recommendation/`）。
- ❌ **不得**直接呼叫Analysis Runner/Recommendation
  Runner（不import`src/intelligence/analysis/`、
  `src/intelligence/recommendation/`）。
- ❌ **不得**直接呼叫Workflow/Use Case/Application
  Service（不import`application/workflows/`、
  `application/use_cases/`、`application/application_service.js`）。
- ❌ **不得**直接呼叫Intelligence Facade（不import
  `src/intelligence/facade/`）。
- ❌ **不得**直接呼叫Execution Manager（不import
  `src/intelligence/execution/`）。
- ❌ **不得**直接存取History Store、Metrics Store、Event
  Dispatcher。
- ❌ **不得**直接存取Database（不import`src/db/`，完全不接受db
  參數）。
- ❌ **不得**import`src/intelligence/service/`、
  `src/intelligence/orchestration/`（Phase 2 Runtime
  Orchestrator）、`data_preparation/`、`governance/`。
- ❌ **不得**呼叫任何AI Provider/AI SDK、不建立任何Prompt Logic。
- ❌ **完全不**import`../insight_feature.js`、`../insight/`、
  `../behavior/`底下任何檔案——三個Feature domain完全平行、互不
  認識。

## 合法流程 vs 禁止流程（規格原文）

**合法**：
```
Feature → Intelligence Feature Integration → Capability Orchestrator → Analysis Capability → Recommendation Capability → Output
```

**禁止**：
```
Feature → AI Provider              ❌
Feature → Database                 ❌
Feature → Runtime Internal Layer   ❌
```

## 目前狀態

- **沒有**接進`src/bootstrap/application.js`的`intelligence`
  物件，**沒有**新增任何API route——這是刻意的邊界決策，跟
  TASK1.76/1.77/1.78同樣的模式：「建立但不改變既有execution
  behavior」，用測試證明Feature可以安全使用整條Capability Flow
  即可，接不接進真實bootstrap留給未來任務決定。
- `insight_feature.js`（TASK1.66）/`behavior_feature.js`
  （TASK1.72）/Workflow Layer/Application Service/Analysis
  Runner/Recommendation Runner/Phase 2 Runtime
  Orchestrator/Analysis Capability/Recommendation
  Capability/Capability Orchestrator本身完全沒有被修改。
- `src/intelligence/application/features/index.js`新增一行
  `export * as intelligence from './intelligence/index.js'`（純
  增量，跟TASK1.66新增`insight`、TASK1.72新增`behavior`同一種
  性質），既有的`insight`/`behavior`namespace完全不受影響。
- 完全沒有連接任何route/controller/`worker.js`。
