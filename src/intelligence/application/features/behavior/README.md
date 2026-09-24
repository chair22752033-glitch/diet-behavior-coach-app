# Behavior Feature Foundation（Phase 3 TASK1.72）

## 目的

建立Phase 3**第二個**Intelligence Application Feature——不是新增
功能、不是建立新Layer、不是導入AI，目的是驗證TASK1.60~1.71建立的
Application Pattern（`Feature → Workflow → Capability → Use Case →
Application Service → Runtime`）不是只能承載Insight這一個domain，
而是可以支援不同的Intelligence Feature domain，並且確認新增這個
domain時完全不依賴、也不修改Insight Feature。

這正是TASK1.71 Extension Pattern Review（見
`../EXTENSION_PATTERN.md`）事先審查過、並用假想的"mealPlan" domain
在測試檔案裡就地驗證過的擴充路徑——本次任務是那份審查結論的
**第一次真正落地**。

## 架構位置

```
Behavior Request
  ↓
Behavior Feature（behavior_feature.js）
  ↓
Workflow（TASK1.64，Behavior domain專屬的獨立實例）
  ↓
Capability（behavior_capability.js的createBehaviorCapability）
  ↓
Use Case（behavior_capability.js的createBehaviorUseCase）
  ↓
Application Service（TASK1.60，跟Insight共用同一個既有實例）
  ↓
Intelligence Runtime
```

## 為什麼Application Service可以跟Insight共用，但Workflow不行

TASK1.71 Extension Pattern Review已經確認：`application_service.js`
（TASK1.60）、Contract Layer（TASK1.63）、四個Result Builder
（capability/use_case/workflow/feature）原始碼完全找不到任何
"insight"業務邏輯字樣，是完全domain-agnostic的共用工具——重複使用
這些既有實例不代表Behavior依賴Insight Feature，因為它們本來就不
認識「insight」或「behavior」的差異。

但`workflows/application_workflow.js`預期注入的`capability`依賴
一定要提供`requestInsightCapability()`這個方法（Workflow既有介面
的字面要求，見`../EXTENSION_PATTERN.md`第3節）。如果Behavior
Feature重複使用`intelligence.workflow`這個**已經注入Insight
Capability/Use Case**的既有Workflow實例，最終會拿到Insight的業務
結果——這違反「確認新增Domain不依賴Insight Feature」的要求。

因此本次任務為Behavior domain**另外呼叫一次**
`createApplicationWorkflow({capability, contractValidator})`，
建立一個完全獨立、只服務Behavior domain的新Workflow實例（注入
`behavior_capability.js`裡的`createBehaviorCapability()`跟共用的
ContractValidator），跟`intelligence.workflow`（服務Insight）是
兩個互不相干的物件。

## Capability + Use Case為什麼合併成一個檔案

本次任務的Implementation Scope明確只列出
`src/intelligence/application/features/behavior/`底下5個檔案，
不包含在共用的`application/capabilities/`、`application/
use_cases/`目錄底下新增檔案（那些目錄目前只有Insight domain專屬的
`insight_capability.js`/`insight_use_case.js`，本次任務明確禁止
修改）。TASK1.71已經確認Capability Layer跟Use Case Layer都是
body完全通用的「薄模板」（驗證輸入→呼叫下一層→包裝結果，三段式），
因此`behavior_capability.js`把這兩個角色實作成同一個檔案裡兩個
獨立的具名export（`createBehaviorUseCase()`跟
`createBehaviorCapability()`），各自的body形狀完全比照TASK1.61/
1.62既有檔案，不引入任何新的Layer類型。

`behavior_capability.js`刻意**不**跨目錄import
`application/capabilities/capability_result_builder.js`或
`application/use_cases/use_case_result_builder.js`——那兩個共用
Result Builder雖然完全domain-agnostic、可以被安全共用（見
`../EXTENSION_PATTERN.md`第1節），但兩者從TASK1.60/1.61建立當下
就是設計成給**同目錄底下**的檔案import使用（`insight_capability.js`
只import同目錄的`./capability_result_builder.js`，
`insight_use_case.js`只import同目錄的`./use_case_result_builder.js`），
從來沒有任何檔案跨目錄直接reach進別的Layer目錄內部檔案。為了
維持「每個Feature目錄完全自成一體」的既有邊界慣例，
`behavior_capability.js`改成用兩個私有函式
（`buildUseCaseSuccessResult()`/`buildUseCaseFailureResult()`/
`buildCapabilitySuccessResult()`/`buildCapabilityFailureResult()`）
就地複製Result Builder的「形狀」，不做任何跨目錄import。

## 檔案

- `behavior_feature.js`：`createBehaviorFeature({workflow})`，
  提供`requestBehavior(db, request)`——驗證輸入 →
  `mapBehaviorFeatureRequestToWorkflowRequest()`把Feature request
  明確重新組裝成Workflow request（只挑選已知欄位）→ 呼叫
  `workflow.executeApplicationRequest()`（唯一允許呼叫的下一層）
  → 統一Behavior Feature output。任何一步失敗都立刻回傳
  `{ok:false, feature:'behavior', reason}`。
- `behavior_capability.js`：
  - `createBehaviorUseCase({applicationService})`，提供
    `requestUserBehavior(db, request)`——直接呼叫
    `applicationService.requestIntelligence()`（共用的既有實例）。
  - `createBehaviorCapability({useCase})`，提供
    `requestInsightCapability(db, request)`——方法名稱刻意沿用
    Workflow既有介面要求的字面名稱（見上方說明），呼叫
    `useCase.requestUserBehavior()`。
- `behavior_result_mapper.js`：`createBehaviorResultMapper()`，
  提供`mapSuccessResult(workflowData)`（組出
  `{ok:true, feature:'behavior', data:{status, result, metadata}}`）
  跟`mapFailureResult(reason)`（組出
  `{ok:false, feature:'behavior', reason}`）。跟
  `../insight/insight_result_mapper.js`（TASK1.66）同樣的形狀，
  只是domain名稱固定為`'behavior'`。
- `index.js`：統一輸出上述三個檔案的內容。
- `README.md`：本檔案。

## 規則（Behavior Feature may call / must NOT call）

- ✅ Behavior Feature只能呼叫Workflow
  （`workflow.executeApplicationRequest()`）。
- ✅ Behavior Capability只能呼叫Behavior Use Case。
- ✅ Behavior Use Case只能呼叫Application Service。
- ❌ **不得**直接呼叫Capability、Use Case、Application Service、
  Intelligence Facade（Behavior Feature本身一律透過Workflow間接
  呼叫）。
- ❌ **不得**直接呼叫Execution Manager（規格明確禁止的捷徑
  「Behavior Feature → Execution Manager」）。
- ❌ **不得**直接存取History Store、Metrics Store、Event
  Dispatcher。
- ❌ **不得**直接存取Database（規格明確禁止的捷徑
  「Behavior Feature → Database」）。
- ❌ **不得**呼叫任何AI Provider/AI SDK（規格明確禁止的捷徑
  「Behavior Feature → AI Provider」）。
- ❌ **完全不import**`../insight_feature.js`、`../insight/`底下
  任何檔案（規格明確禁止的捷徑「Behavior Feature → Insight
  Feature」）——Insight跟Behavior兩個domain完全平行、互不認識。
- ❌ **不得**import `src/services/`（既有Domain Service）。
- ❌ **不得**import `src/auth/`、`src/oauth/`、`src/identity/`、
  `src/middleware/`。
- ❌ **不知道**HTTP是什麼——不import任何路由/controller檔案。

## 合法流程 vs 禁止流程（規格原文）

**合法**：
```
Behavior Request → Behavior Feature → Workflow → Capability
  → Use Case → Application Service → Intelligence Runtime
```

**禁止**：
```
Behavior Feature → Insight Feature ❌
Behavior Feature → Database        ❌
Behavior Feature → AI Provider     ❌
```

## 目前狀態

- `src/bootstrap/application.js` 新增
  `application.intelligence.behaviorFeature`，組裝
  `createBehaviorFeature({workflow: behaviorWorkflow})`實例——
  `behaviorWorkflow`是**新建立**、只服務Behavior domain的
  `createApplicationWorkflow()`實例（注入`behaviorCapability`跟
  跟Insight共用的`intelligenceContractValidator`），
  `behaviorCapability`/`behaviorUseCase`則分別是`createBehaviorCapability()`/
  `createBehaviorUseCase({applicationService: intelligenceApplicationService})`
  的實例（`applicationService`是跟Insight共用的既有實例）。純粹的
  依賴注入組裝，不影響`intelligence.workflow`/
  `intelligence.insightFeature`/`intelligence.insightExecutionFlow`/
  `intelligence.capabilities`/`intelligence.useCases`/
  `intelligence.application`/其餘既有欄位的行為。
- `application/capabilities/insight_capability.js`、
  `application/use_cases/insight_use_case.js`、
  `application/features/insight_feature.js`、
  `application/features/insight/`底下全部檔案完全沒有被修改——
  本次任務明確禁止觸碰Insight Feature/Insight Domain Logic。
- 完全沒有連接任何route/controller/`worker.js`，也沒有新增任何
  API route——這是Phase 3第二個Intelligence Application Feature
  extension point，還沒有任何真實的User Application呼叫它。
