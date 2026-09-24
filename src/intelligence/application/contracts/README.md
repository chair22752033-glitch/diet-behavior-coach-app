# Intelligence Application Contract Layer（TASK 1.63，Phase 3）

## 目的

在Capability Layer（TASK1.62）、Use Case Layer（TASK1.61）、
Application Service（TASK1.60）之間定義一份統一的Request/Response
Contract——本次**不是建立API，也不是建立UI，也不是導入AI**，目的
是確保未來新增的Capability/Use Case/Application Service都使用一致
的資料格式，而不是各自演化出不同的形狀。

**這個任務不是 AI 功能開發**：兩個contract都只做結構驗證（欄位是否
存在、typeof是否相符），完全不解讀欄位內容、不做任何推論/分類/
摘要/建議。

## 架構位置

```
User Application
  ↓
Capability（TASK1.62）
  ↓
Use Case（TASK1.61）
  ↓
Application Contract Validation（這裡）
  ↓
Application Service（TASK1.60）
  ↓
Intelligence Facade（TASK1.48）
  ↓
Runtime
```

這個架構位置描述的是Contract Layer在整條呼叫鏈裡「概念上」的合法
定位——跟TASK1.55 Governance Layer的架構位置圖同樣的性質：Contract
Layer目前**沒有**透過import被實際串接進Capability/Use Case/
Application Service三層的原始碼，這三層各自內建的
validateXxxRequest()（`validateCapabilityRequest`/
`validateUseCaseRequest`/`validateApplicationRequest`）保持完全
不變，繼續各自獨立驗證。這裡定義的contract是一份**獨立、可驗證的
規格**，用測試直接呼叫三層的真實函式、把真實的輸入/輸出餵給這裡的
contract驗證，藉此證明「三層事實上遵守同一份規則」，而不是把三層
重構成import這個目錄——維持「建立但不改變既有execution behavior」
這個跟Governance Layer一致的邊界決策。

## 檔案

- `application_request_contract.js`：`ApplicationRequestContract`
  （規格：必填`userId`，選填`options`/`requestId`/`version`/
  `timestamp`/`metadata`）跟
  `validateApplicationRequestContract(request)`——驗證`userId`是否
  為非空字串、`options`存在時是否為物件，跟Capability/Use Case/
  Application Service三層各自內建的規則完全一致。
- `application_response_contract.js`：`ApplicationResponseContract`
  跟`validateApplicationResponseContract(response)`——驗證三層共同
  的最小交集：`ok`是否為布林值、成功時`data`是否具備
  `status`/`result`/`metadata`三個欄位、失敗時`reason`是否為非空
  字串。刻意不要求、也不檢查`useCase`/`capability`這類「各層自己
  額外加上去的標籤欄位」，讓這個contract維持在「Application Layer
  共同契約」的定位，不綁死任何一個特定Capability的形狀。
- `contract_validator.js`：`createContractValidator(dependencies)`，
  把上述兩個contract組裝成一個穩定的entry
  point——`validateRequest(request)`/`validateResponse(response)`，
  回傳格式統一為`{ok:true}` / `{ok:false, reason, field?}`，不管
  驗證的是request還是response。
- `index.js`：統一輸出上述三個檔案的內容。

## 規則（Contract Layer may call / must NOT call）

- ✅ 只能呼叫同目錄的兩個contract檔案。
- ❌ **不得**直接存取Database（不import `src/db/`底下任何檔案）。
- ❌ **不得**直接處理Authentication（不import `src/auth/`、
  `src/oauth/`、`src/identity/`、`src/middleware/`）。
- ❌ **不得**直接操作Execution Runtime（不import
  `src/intelligence/execution/`、`src/intelligence/facade/`、
  `src/intelligence/service/`、`src/intelligence/orchestration/`、
  `src/intelligence/analysis/`、`src/intelligence/recommendation/`、
  `src/intelligence/data_preparation/`、`src/intelligence/history/`、
  `src/intelligence/metrics/`、`src/intelligence/events/`、
  `src/intelligence/governance/`底下任何檔案）。
- ❌ **不得**主動呼叫Application Service/Use Case/Capability（不
  import`../application_service.js`、`../use_cases/`、
  `../capabilities/`底下任何檔案）——這是被動的純函式驗證工具，
  被上層拿去用，不是主動呼叫上層的協調者。
- ❌ **不得**呼叫任何AI Provider/AI SDK。

## 合法流程 vs 禁止流程（規格原文）

**合法**：
```
User Application → Capability → Use Case
  → Application Contract Validation → Application Service
  → Intelligence Facade → Runtime
```

**禁止**：
```
Contract → Database          ❌
Contract → Execution Manager ❌
Contract → AI Provider       ❌
```

## 目前狀態

- `src/intelligence/application/index.js` 新增
  `export * as contracts from './contracts/index.js';`。
- `src/bootstrap/application.js` 本次**不需要修改**——這幾個
  contract是純函式驗證工具（跟TASK1.47
  `src/intelligence/contracts/execution/`同樣的角色），不是需要在
  `createApplication()`組裝的獨立子層實例，`intelligence`物件維持
  19個欄位不變。
- Capability（`insight_capability.js`）、Use Case
  （`insight_use_case.js`）、Application Service
  （`application_service.js`）三者的原始碼**完全沒有被修改**——
  各自唯一的相對路徑import維持不變，Execution Runtime Behavior
  不變。
- 測試直接呼叫Capability/Use Case/Application Service三層的真實
  函式，把真實產生的request/response餵給這裡的contract驗證，證明
  三層目前事實上使用一致的資料格式。
