# Phase 3 Application Layer Consolidation Review（TASK1.73）

## 目的

本文件是**TASK1.73 Phase 3 Application Layer Consolidation
Review**的審查結論——不新增功能、不建立新Layer、不導入AI，目的是
在Phase 3已經有兩個真實Feature（Insight跟Behavior）並存之後，
確認整條Application Architecture確實具備：

- 多Feature支援能力
- Domain Isolation
- Shared Boundary正確性
- Phase 4 Extension Point

驗證方式見`backups/phase3-task1.73-application-consolidation/
test_application_consolidation_review.mjs`——原始碼靜態分析
（grep-based dependency scan，同時掃描Insight跟Behavior兩個
domain）+ 端對端測試（透過`app.intelligence.insightFeature`跟
`app.intelligence.behaviorFeature`同時運作，確認彼此互不干擾）。

## 1. Feature Architecture Review：Insight跟Behavior是否遵守共同Pattern

確認結果：**是**。兩個Feature domain各自的檔案body形狀完全對稱：

| 角色 | Insight | Behavior |
|---|---|---|
| Feature Entry | `features/insight/insight_capability.js`的`createInsightFeatureCapability({workflow})` | `features/behavior/behavior_feature.js`的`createBehaviorFeature({workflow})` |
| Capability | `application/capabilities/insight_capability.js`的`createInsightCapability({useCase})` | `features/behavior/behavior_capability.js`的`createBehaviorCapability({useCase})` |
| Use Case | `application/use_cases/insight_use_case.js`的`createInsightUseCase({applicationService})` | `features/behavior/behavior_capability.js`的`createBehaviorUseCase({applicationService})` |
| Result Mapper | `features/insight/insight_result_mapper.js` | `features/behavior/behavior_result_mapper.js` |

兩者都遵守「驗證輸入→（可選：明確重新組裝request）→呼叫下一層
（唯一允許呼叫的對象）→用專屬的Result Mapper/Builder包裝結果」
四段式形狀，唯一差異是TASK1.72基於Implementation Scope的檔案
數量限制，把Capability跟Use Case合併進同一個
`behavior_capability.js`檔案（見TASK1.72commit訊息與
`features/behavior/README.md`），這是檔案組織上的差異，不是
架構模式上的差異——兩個角色的「驗證→呼叫下一層→包裝」body邏輯
仍然分別以兩個獨立的具名export存在。

## 2. Domain Isolation Review：Feature之間無互相import、無共享domain logic

確認結果：**是**。逐一掃描`features/insight/`（12個檔案）跟
`features/behavior/`（5個檔案）確認：

- 沒有任何Behavior檔案import`../insight_feature.js`或
  `../insight/`底下任何檔案
- 沒有任何Insight檔案import`../behavior_feature.js`或
  `../behavior/`底下任何檔案（Insight是TASK1.66~1.69建立，早於
  Behavior存在，天然不會有這個方向的依賴，但本次審查仍然明確
  驗證這個事實）
- 兩者各自的domain識別字樣（`INSIGHT_DOMAIN`/`insightFeature`/
  `insightCapability` vs `behavior`相關識別字）完全不互相出現
- `application/capabilities/insight_capability.js`跟
  `application/use_cases/insight_use_case.js`是Insight專屬的
  Capability/Use Case層實作，Behavior的對應角色完全在
  `features/behavior/behavior_capability.js`裡自行實作，兩者
  互不import、互不重用彼此的validate/map函式（刻意的邊界獨立
  決策，從TASK1.60就開始的既定慣例）

## 3. Shared Layer Review：Application Service/Contract/Result Builder是否保持domain agnostic

確認結果：**是**，而且現在有兩個真實domain共同驗證這個結論
（TASK1.71 Extension Pattern Review用假想的"mealPlan" domain
就地模擬過一次，本次審查用真正落地的Behavior Feature再次確認）：

- `application_service.js`（TASK1.60）：原始碼（去除註解）完全
  找不到"insight"或"behavior"字樣，Insight跟Behavior的Use Case
  都呼叫同一個`intelligenceApplicationService`實例的
  `requestIntelligence()`，這個實例完全不知道呼叫方是哪個domain
- Contract Layer（TASK1.63，4個檔案）：同樣完全domain-agnostic，
  Insight跟Behavior的Workflow都注入同一個
  `intelligenceContractValidator`實例
- 4個Result Builder（capability/use_case/workflow/feature）：
  Insight的`insight_capability.js`（application/capabilities/）/
  `insight_use_case.js`繼續使用這兩個共用Result Builder；Behavior
  則因為Implementation Scope的檔案數量限制選擇不跨目錄import它們
  （見`features/behavior/README.md`），改用同檔案內就地複製的
  形狀——這證明共用Result Builder本身的參數化介面完全足以支援
  第二個domain，Behavior沒有使用它純粹是檔案組織的選擇，不是
  共用層本身有任何domain-specific限制

## 4. Workflow Boundary Review

逐項確認`workflows/application_workflow.js`（TASK1.64）：

- **Domain leakage**：**沒有發現**。Workflow本身的程式碼（去除
  註解後）完全不含"insight"或"behavior"業務邏輯字樣，唯一提及
  "Insight"字樣的地方是介面方法名稱`requestInsightCapability`
  （見下方「Naming limitation」）。Workflow不持有任何domain
  特定的狀態，每次`createApplicationWorkflow()`呼叫都產生獨立、
  互不干擾的實例——目前bootstrap.js確實建立了兩個獨立實例
  （`intelligenceApplicationWorkflow`服務Insight、
  `intelligenceBehaviorWorkflow`服務Behavior），互不共用也互不
  污染。
- **Naming limitation**：**存在，已記錄，不修正**。Workflow
  預期注入的`capability`依賴一定要提供一個叫做
  `requestInsightCapability`的方法——這個介面方法名稱字面上
  提及"Insight"，但Workflow本身不解讀這個名稱的業務含義（只檢查
  `typeof capability.requestInsightCapability === 'function'`）。
  TASK1.71 EXTENSION_PATTERN.md已經記錄這個限制，TASK1.72
  Behavior Feature已經證明這個限制不影響第二個domain的整合（
  Behavior的Capability物件也提供這個方法名稱，跟業務語意無關）。
  本次審查重新確認：這不屬於需要修正的「明確架構不一致」——
  修改這個方法名稱屬於「修改既有、被TASK1.64/1.65/1.66/1.67/
  1.68/1.69/1.70/1.71/1.72共九個以上任務的測試檔案斷言覆蓋的
  Workflow介面」，風險遠大於收益，而且不影響任何實際功能正確性，
  純粹是名稱美觀問題。
- **Incorrect dependency**：**沒有發現**。Workflow只依賴注入的
  `capability`跟`contractValidator`兩個參數，不import任何
  Feature-specific或domain-specific的檔案，也不在原始碼裡硬編碼
  任何特定Capability/ContractValidator的實例參照。

## 5. Phase 4 Extension Point：未來新增Feature或AI Capability的合法入口

整理截至TASK1.72為止確認可行、且本次審查沒有發現需要修改的
擴充路徑：

### 5.1 新增第三個（或更多）Intelligence Feature

比照Behavior Feature（TASK1.72）的路徑：

1. 在`src/intelligence/application/features/<newDomain>/`建立
   平行目錄，包含至少：`<newDomain>_feature.js`（Feature Entry，
   呼叫Workflow）、負責Capability/Use Case角色的檔案（body形狀
   比照`insight_capability.js`/`insight_use_case.js`或
   `behavior_capability.js`的模板）、`<newDomain>_result_mapper.js`、
   `index.js`、`README.md`。
2. 在`src/intelligence/application/features/index.js`新增
   `export * as <newDomain> from './<newDomain>/index.js'`（純
   新增一行，不修改既有namespace）。
3. 在`src/bootstrap/application.js`裡：
   - 重複使用共用、domain-agnostic的
     `intelligenceApplicationService`（不需要新建）
   - 重複使用共用的`intelligenceContractValidator`（不需要新建）
   - 為新domain的Capability物件另外呼叫一次
     `intelligenceApplicationNamespace.workflows.
     createApplicationWorkflow({capability, contractValidator})`
     建立**獨立的新Workflow實例**（不可重複使用
     `intelligenceApplicationWorkflow`或
     `intelligenceBehaviorWorkflow`，避免新domain意外拿到既有
     domain的業務結果）
   - 新增一個`intelligence.<newDomain>Feature`欄位（純新增，不
     修改既有欄位）
4. 全程不需要修改`Application Service`/`Contract Layer`/四個
   `Result Builder`/Runtime Execution Layer/既有任何Feature
   domain的檔案。

### 5.2 未來導入真實AI Capability（Phase 4，本次任務不涉及）

Phase 3建立的整條Application Pattern（Feature→Workflow→
Capability→Use Case→Application Service→Facade→Execution
Manager→Service→Orchestrator→Data Preparation/Analysis/
Recommendation）目前Analysis/Recommendation階段是規則式
（rule-based）邏輯，不是AI推論。合法的AI導入入口，未來若要
啟用，應該只發生在Runtime層（`src/intelligence/analysis/
analysis_runner.js`、`src/intelligence/recommendation/
recommendation_runner.js`，或它們各自呼叫的下一層），且應該
維持目前已經確立的介面形狀（`runAnalysis(context, options)`
回傳`{ok, result, reason?}`／`runRecommendation(analysisResult)`
回傳`{ok, result, reason?}`）不變，讓Application Layer/Feature
Layer完全不需要感知底層是規則式邏輯還是AI推論——這正是目前
整條Application Pattern「每一層只認識自己呼叫的下一層」的邊界
設計所帶來的優勢：Phase 4要導入AI，理論上只需要替換Runtime
最底層的實作，Feature/Workflow/Capability/Use Case/Application
Service全部不需要變動。本次任務**不**進行這個替換（明確禁止
「導入AI SDK」），這裡只整理合法入口供未來參考。

## 完成標準確認

- ✅ Phase 3 Application Layer Consolidation完成（見上方五節
  審查結論）
- ✅ Multi Feature Pattern正確（Insight跟Behavior遵守同一套
  四段式body形狀）
- ✅ Domain Isolation正確（兩個Feature完全互不import、互不共享
  domain logic）
- ✅ Phase 4 Extension Point明確（見上方5.1/5.2）
- ✅ AI Provider未啟用
- ✅ 無Database改變
