# Health Insight Feature Foundation Implementation（Phase 6 TASK1.111）

## 目的

依照TASK1.106（產品定義）、TASK1.107（輸入邊界）、TASK1.108
（輸出邊界）、TASK1.109（UX流程）、TASK1.110（實作架構規劃）
累積的規劃，第一次把"Health Insight Feature"落地成最小可運作的
骨架——這是Phase 6系列**第一個**寫production code的任務。本次
任務**不**實作UI、**不**建立route/controller、**不**整合任何AI
Provider、**不**建立database schema。

## Feature Responsibility（Feature責任）

Health Insight Feature只負責三件事：

1. **接收Product-level request**（`{context, options?}`形狀）
2. **呼叫既有Capability Orchestrator**（透過依賴注入拿到的
   `capabilityOrchestrator.requestCapabilityFlow()`）
3. **把Unified Capability Result轉換成Health Insight formatted
   result**（透過`health_insight_result_mapper.js`）

Feature層擁有**product-specific transformation**的責任；
Capability層擁有**intelligence processing**的責任——本次任務
明確不把Capability邏輯搬進Feature層（不重新實作Analysis/
Recommendation邏輯）。

## Architecture Flow（架構流程）

```
Product Layer（未來，本次任務不建立呼叫端）
  ↓
Health Insight Feature（這裡）
  ↓
Capability Orchestrator（TASK1.78，完全不修改）
  ↓
Analysis Capability（TASK1.76，完全不修改）
  ↓
Recommendation Capability（TASK1.77，完全不修改）
  ↓
Runtime（Phase 2，完全不修改）
```

這條鏈路刻意比照`../../../application/features/intelligence/
intelligence_feature.js`（TASK1.79）同樣的"Feature直接呼叫
Capability Orchestrator"設計——兩者是**平行**存在、互不認識的
兩個Feature層級入口，Health Insight Feature是這個平行結構的
第三條路徑。差異在於Intelligence Feature產生**通用**的
`{analysis, recommendation}`Feature Output，Health Insight
Feature產生**Health Insight特定**的`{healthObservation,
behaviorPattern, recommendation, progressTrend,
decision}`Product Output（延續TASK1.108定義的四類輸出）。

## Dependency Direction（依賴方向）

```
Health Insight Feature
  ↓
Capability Layer（Capability Orchestrator）
  ↓
Runtime
```

**絕對不會**是反方向（Capability → Health Insight Feature）。

Health Insight Feature：

- ✅ 只呼叫依賴注入拿到的`capabilityOrchestrator.
  requestCapabilityFlow()`
- ❌ 不繞過Capability Orchestrator直接呼叫Analysis/
  Recommendation/Decision Capability
- ❌ 不直接呼叫Analysis Runner/Recommendation Runner
- ❌ 不import Phase 3 Application Layer（含既有Intelligence
  Feature Integration本身）
- ❌ 不import五個既有Product Boundary
  （Entry/Adapter/Execution/Operational/Contract）
- ❌ 不直接存取Database/Auth/Session/Execution
  Manager/History/Metrics/Events
- ❌ 不呼叫任何AI Provider/AI SDK

## Input/Output Boundary（輸入輸出邊界）

### Input（延續TASK1.111 Request Boundary）

```js
{
  context,   // Insight Context形狀的物件
  options,   // 選填，原樣轉交給Capability Orchestrator
}
```

**不**直接消費：authentication data、session data、database
objects。

### Output（延續TASK1.108 Output Boundary Definition）

成功：

```js
{
  ok: true,
  feature: 'health_insight',
  data: {
    healthObservation: [{ type, value }],  // 來自Analysis insights，捨棄source
    behaviorPattern: [],                    // V1不產生，固定空陣列
    recommendation: [{ type, value }],      // 來自Recommendation recommendations，捨棄source
    progressTrend: {},                      // V1不產生，固定空物件
    decision: null,                         // future decision placeholder
  },
}
```

失敗：

```js
{
  ok: false,
  feature: 'health_insight',
  reason,
  field?,
  stage?,   // 'request'|'capability'|'analysis'|'recommendation'|'decision'|'mapping'
}
```

**不**暴露：runtime metadata（Capability整體的`status`/
`capability:'orchestration'`標籤）、execution details、internal
capability structure、stack trace、internal exception。

## Capability Usage（Capability使用方式）

Health Insight Feature透過依賴注入拿到`capabilityOrchestrator`
（介面`{requestCapabilityFlow}`），呼叫既有Capability
Orchestrator（TASK1.78）取得Unified Capability Result
（`{analysis, recommendation, decision?}`），**不**重新實作
Analysis/Recommendation邏輯，**不**新增任何跨時間模式偵測邏輯。

## Error Boundary（錯誤邊界）

- **invalid input**：`context`不是物件、`options`存在但不是
  物件時，回傳`{ok:false, reason:'invalid_context'|
  'invalid_options_type', stage:'request'}`
- **capability failure**：`capabilityOrchestrator`未提供/介面
  不符時回傳`capability_orchestrator_unavailable`；呼叫本身拋出
  例外時用try/catch攔截，回傳`capability_execution_failed`，
  **不**暴露原始例外訊息；Capability Orchestrator正常回傳
  `{ok:false}`時原樣轉發`reason`/`field`/`stage`
- **mapping failure**：`resultMapper.mapSuccessResult()`拋出
  例外時用try/catch攔截，回傳`mapping_failed`，**不**暴露原始
  例外訊息

## Current Limitations（目前限制）

- **沒有接進`src/bootstrap/application.js`**：延續Phase 4/
  Phase 5系列一貫的"建立但不改變既有execution behavior"模式，
  本次任務只用測試證明Health Insight Feature + Capability
  Orchestrator可以被安全地組合執行，實際接上真實route/UI留給
  未來任務決定。
- **behaviorPattern/progressTrend固定為空陣列/空物件**：延續
  TASK1.108已確認的"V1範圍"結論，這兩類輸出需要新的Analysis
  模組（跨時間模式偵測/歷史weight序列），本次任務**沒有**、也
  **不應該**新增這類邏輯。
- **decision固定為null**：延續Decision Capability
  （TASK1.83）既有的佔位設計，本次任務沒有給Capability
  Orchestrator注入`decisionCapability`依賴。
- **不做任何文字措辭轉換**：`healthObservation`/
  `recommendation`只做結構化的欄位重新分類
  （`{type, value}`），不會產生"這週記錄了幾次活動"這類自然
  語言句子，這類轉換留給未來的Product呈現層。
