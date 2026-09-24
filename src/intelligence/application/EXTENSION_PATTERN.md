# Intelligence Feature Extension Pattern（Phase 3 TASK1.71審查）

## 目的

本文件是**TASK1.71 Intelligence Feature Extension Pattern
Review**的審查結論——不新增Feature、不建立新Layer、不導入AI、不
建立Feature Manager/Registry/Factory，純粹分析並記錄：目前用
Insight Feature（TASK1.60~1.69）建立起來的Application Pattern，
未來新增其他Intelligence Feature（例如假想的"mealPlan"、
"coaching"）時，哪些層可以直接原樣共用、哪些層需要複製模板、
以及目前架構裡有沒有應該抽出的共用工具或不必要的重複。

驗證方式見
`backups/phase3-task1.71-feature-extension-review/
test_feature_extension_pattern.mjs`——除了原始碼靜態分析
（grep-based dependency scan），也在測試檔案內部「就地」組裝一個
完全不落地成production檔案的假想`mealPlan` Feature domain，證明
共用層可以在不修改的情況下被第二個domain重複使用。

## 結論總覽

| 層 | 檔案 | 可否被新Feature原樣共用 |
|---|---|---|
| Application Service（TASK1.60） | `application_service.js` | ✅ 完全共用，不需要任何修改 |
| Contract（TASK1.63） | `contracts/*.js`（4個檔案） | ✅ 完全共用，不需要任何修改 |
| Workflow（TASK1.64） | `workflows/application_workflow.js` | ⚠️ 可以共用同一個工廠函式`createApplicationWorkflow()`，但預期capability依賴要提供`requestInsightCapability()`這個方法名稱（見下方「已知命名細節」） |
| 4個Result Builder | `capability_result_builder.js`/`use_case_result_builder.js`/`workflow_result_builder.js`/`feature_result_builder.js` | ✅ 完全共用，已經是`buildSuccessResult(name, data)`/`buildFailureResult(name, reason)`參數化介面 |
| Use Case（TASK1.61） | `use_cases/insight_use_case.js` | 🔁 body當模板複製，換掉`USE_CASE_NAME`常數跟入口方法名稱 |
| Capability（TASK1.62） | `capabilities/insight_capability.js` | 🔁 body當模板複製，換掉`CAPABILITY_NAME`常數跟入口方法名稱 |
| Feature Entry（TASK1.65） | `features/insight_feature.js` | 🔁 body當模板複製，換掉`FEATURE_NAME`常數跟入口方法名稱 |
| Output Model（TASK1.68） | `features/insight/output/insight_output_model.js` | ✅／🔁 視情況：欄位形狀（status/context/analysis/recommendation/metadata）是Runtime層級通用形狀，若新Feature的輸出剛好符合這個形狀可以直接共用`validateInsightOutput()`；若欄位不同則需要複製一份改名 |
| Insight專屬實作（TASK1.66~1.69） | `features/insight/`整條樹（12個檔案） | ❌ 不共用——新Feature應該建立平行的`features/<newFeature>/`目錄 |

## 1. 完全通用、可原樣共用的層

以下檔案的**實際程式碼**（去除註解後）完全找不到任何`insight`
字樣，證明它們從一開始（TASK1.60/1.63建立當下）就是domain-agnostic
的共用工具，新增Feature時不需要修改、也不需要重新抽出：

- `application_service.js`、`application_result_builder.js`
- `contracts/application_request_contract.js`、
  `contracts/application_response_contract.js`、
  `contracts/contract_validator.js`
- `capabilities/capability_result_builder.js`、
  `use_cases/use_case_result_builder.js`、
  `workflows/workflow_result_builder.js`、
  `features/feature_result_builder.js`

四個Result Builder都採用`buildSuccessResult(name, data)`/
`buildFailureResult(name, reason)`這種把domain名稱當作參數傳入的
設計——這代表「讓Result Builder可以被任何Feature domain共用」這件
事，早在TASK1.60建立第一個Result Builder時就已經做對了，不是
TASK1.71才發現需要重構的缺口。

## 2. Domain-specific「薄模板」層

`use_cases/insight_use_case.js`、`capabilities/insight_capability.js`、
`features/insight_feature.js`三個檔案的body邏輯（驗證輸入→呼叫
下一層→包裝結果，三個步驟）完全通用，**唯一**domain-specific的
地方是：

- 一個`XXX_NAME = 'insight'`常數
- 一個具名的入口方法（`requestUserInsight`/`requestInsightCapability`/
  `requestInsightFeature`）

新增Feature時，正確的作法是複製這三個檔案的**形狀**（validate→call
next layer→build result三段式），放到對應目錄下（例如
`use_cases/meal_plan_use_case.js`），换掉常數字面值跟方法名稱——
而不是想辦法讓這三個檔案本身變成參數化的泛用版本。這是刻意的
架構決策：這三層body只有10幾行，硬要抽成一個共用的
`createGenericUseCase({name, nextLayerMethodName, ...})`
反而會需要動態方法名稱、動態欄位名稱這類額外的間接層，讓每一層
「只做開頭的驗證+往下呼叫+包裝」這個簡單直觀的形狀變得難以
閱讀——這正是規格要求的「未產生過度抽象」，也是TASK1.60~1.65
每一層README已經反覆記錄過的「每一層邊界獨立、不互相重用驗證
函式」既定決策的延伸。

## 3. 已知的命名細節（不是bug，記錄成future note）

`workflows/application_workflow.js`預期注入的`capability`依賴
一定要提供一個叫做`requestInsightCapability()`的方法——這個介面
方法名稱本身帶有"Insight"字樣，即使Workflow完全不解讀capability
回傳內容的業務含義（Workflow只檢查`typeof capability.
requestInsightCapability === 'function'`，不做任何domain判斷）。

這代表：
- 如果未來第二個Feature想要讓自己的Capability物件被**同一個**
  `createApplicationWorkflow()`呼叫，牠的Capability物件介面方法
  名稱technically上也得叫做`requestInsightCapability`（即使業務
  domain不是insight）；
- 更乾淨、也是本文件建議的作法：`createApplicationWorkflow`本來
  就是factory函式，不是singleton——直接為第二個Feature另外呼叫
  一次`createApplicationWorkflow({capability: 第二個Feature的
  capability, contractValidator})`，建立**獨立的第二個Workflow
  實例**，重複呼叫這個factory本來就合法、也不會跟現有的
  `intelligence.workflow`實例互相干擾（`test_feature_extension_
  pattern.mjs`的「extension compatibility」分類已經用假想的
  `mealPlan` domain實際驗證這條路徑走得通）。

本次審查決定**不修改**`application_workflow.js`把方法名稱改成
更通用的名稱（例如`execute()`）——這屬於「修改既有、已經被
TASK1.64/1.65/1.66/1.67/1.68/1.69/1.70共十幾份測試檔案斷言覆蓋
的Workflow介面」，風險（大量既有測試需要同步更新、且沒有任何
規格要求這個重構）大於收益（純粹的命名美觀），不屬於「明確重複
邏輯」，因此不在本次任務「發現明確重複邏輯時提出修正」的授權
範圍內。

## 4. Insight專屬實作完全隔離

`features/insight/`底下12個檔案（`insight_capability.js`/
`insight_result_mapper.js`/`index.js` + `context/`/`output/`/
`execution/`三個nested子目錄各4個檔案，TASK1.66~1.69建立）
完全獨立於上述共用層跟薄模板層之外——沒有任何共用層檔案import
`features/insight/`底下任何東西。新增Feature時，正確的作法是
建立平行的`features/<newFeature>/`目錄，不會、也不應該修改
`features/insight/`任何檔案，兩者可以完全並存，如同目前
`intelligence.insightFeature`（TASK1.66）跟`intelligence.
insightExecutionFlow`（TASK1.69）已經並存的先例。

## 5. Duplication Review結論

**沒有發現需要抽出的共用工具，也沒有發現不必要的複製。**

各層之間刻意保留的`validateXxxRequest()`／
`mapXxxRequestToYyyRequest()`重複（Capability/Use Case/
Application Service/Workflow/Feature Entry/Insight Feature
Capability/Insight Execution Flow每一層都各自重新實作一份幾乎
一樣的最小`userId`/`options`形狀驗證跟欄位挑選）是從TASK1.60就
開始的既定架構決策，目的是讓每一層可以獨立演進、不因為共用了
一個驗證函式而互相耦合（TASK1.63已經把這份共同規則獨立定義成
`ApplicationRequestContract`跟`validateApplicationRequestContract()`
供未來需要「集中驗證」的層——例如Workflow——採用；其餘層則刻意
維持「各自獨立、不重用彼此驗證函式」的邊界，這是TASK1.60~1.69
每一層README已經反覆記錄過的決策，不是TASK1.71才發現的新問題）。

把這些薄薄的10行以內驗證邏輯抽成一個共用的
`validateMinimalApplicationRequest()`工具，表面上減少了幾行
重複程式碼，實際上會讓每一層之間產生一條隱性耦合——未來任何一層
想要調整自己的驗證規則，都得先確認會不會影響到其他層——這正是
規格「未產生過度抽象」要避免的情況。本次審查因此**不建議**、也
**沒有**進行這個抽出。

## 完成標準確認

- ✅ Phase 3 Feature Extension Pattern明確（見上方結論總覽表）
- ✅ Insight Feature可作為範本（Use Case/Capability/Feature
  Entry三層的薄模板形狀可以直接複製給下一個Feature domain使用）
- ✅ 未產生過度抽象（沒有新增Feature Manager/Registry/Factory，
  也沒有把薄模板層或驗證邏輯過早抽象化）
- ✅ Runtime保持隔離（本次審查完全沒有修改Runtime Execution
  Layer或Application Layer任何production程式碼）
- ✅ AI Provider未啟用
- ✅ 無Database改變
