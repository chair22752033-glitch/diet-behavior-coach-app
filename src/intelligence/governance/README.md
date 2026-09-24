# Intelligence Execution Governance Layer（TASK 1.55）

## 目的

在Execution Manager（TASK1.50）、Execution Event（TASK1.51）、
Execution History（TASK1.52）、Execution Monitoring（TASK1.53）、
Execution Metrics（TASK1.54）之上，建立一個獨立的治理邊界——負責
回答「這次Intelligence執行允不允許進行」，為Phase 3導入真實分析
能力時可以在Intelligence Pipeline外層加入治理控制（例如額度限制、
執行頻率限制、輸入合法性把關）預留邊界，而不需要直接修改
Analysis/Recommendation/Orchestration。

**這個任務不是 AI 功能開發**：Governance完全不做任何推論、分類、
摘要、建議，只做純結構性的政策檢查——是否允許執行、是否符合
execution rules、是否符合runtime constraints，全部都是形狀/型別
層級的判斷，不涉及任何業務決策。

## 架構位置（規格原文，描述未來可以怎麼接，不是這次任務已經接上）

```
Execution Facade（TASK1.48）
  ↓
Execution Manager（TASK1.50）
  ↓
Governance Layer（這裡）── 只判斷「允不允許執行」，不執行分析
  ↓
Execution Policy Validation
  ↓
既有 Intelligence Pipeline（Orchestrator/Analysis/Recommendation）
```

**這次任務刻意不把Governance接進上面這條真實呼叫鏈**——規格明確
要求「不要直接修改Orchestrator/Analysis/Recommendation」，「若需要
串接，只能透過Dependency Injection」，且Bootstrap Requirement明確
要求「純新增namespace，不改變既有execution behavior」。因此這裡
建立的是一個完全獨立、可以在未來被facade/execution manager透過
依賴注入接上的Governance Service，但`execution_manager.js`/
`intelligence_facade.js`本次完全沒有被修改——跟TASK1.53
（Monitoring）、TASK1.54（Metrics）建立唯讀觀察層、完全不觸碰
execution_manager.js的既有慣例一致。

## 檔案

- `execution_policy.js`：`validateExecutionPolicy(input)`，對
  `{userId, options, runtimeContext}`做純結構性檢查，回傳
  `{allowed, reasons}`（`reasons`是陣列，收集全部違反的規則，不是
  「第一個失敗就停止」）。三條固定規則：
  - `missing_user_id`：`userId`必須是非空字串。
  - `invalid_options`：`options`如果有提供，必須是純物件（不是
    陣列、不是`null`）。
  - `invalid_runtime_context`：`runtimeContext`如果有提供，必須是
    純物件（不是陣列、不是`null`）。
  明確**不做**規格禁止的事情：不讀取database（沒有db參數，也沒有
  import`src/db/`）、不查詢user status（不呼叫任何
  service/repository）、不解析session（不import`src/auth/`或
  `src/oauth/`）、不包含business decision（只檢查輸入形狀，不判斷
  業務資格）。
- `governance_result_builder.js`：`buildGovernanceResult(input)`
  組出`{status, allowed, reasons, metadata}`，未提供的欄位使用
  固定預設值（`status:null, allowed:false, reasons:[], metadata:{}`）。
  純函式，不讀取`Date.now()`/`Math.random()`。
- `governance_service.js`：`createGovernanceService(dependencies)`，
  提供`validateExecution(input)`——呼叫`execution_policy.js`的
  `validateExecutionPolicy()`後組成統一輸出，`status`依
  `allowed`分別為`'governance_passed'`/`'governance_rejected'`，
  `metadata`固定帶`{version:'1.0'}`（規格範例原文）。選填的
  `dependencies.policyValidator`依賴注入讓測試可以觀察組裝行為，
  不提供時使用預設政策規則。這個檔案完全不import
  `src/intelligence/facade/`、`src/intelligence/execution/`、
  `src/intelligence/orchestration/`、`src/intelligence/analysis/`、
  `src/intelligence/recommendation/`、`src/intelligence/service/`
  底下任何檔案——唯一的相對路徑import是`./execution_policy.js`跟
  `./governance_result_builder.js`。
- `index.js`：統一輸出上述三個檔案的內容。

## 規則

- **deterministic**：同樣的輸入，任何時候
  `validateExecutionPolicy()`/`validateExecution()`都得到完全相同
  的結果。
- **no database dependency**：完全不 import `src/db/` 底下任何
  檔案，也沒有任何函式接受db參數。
- **no authentication dependency**：完全不 import `src/auth/`、
  `src/oauth/`、`src/middleware/`底下任何檔案，不解析
  session/cookie/JWT。
- **no AI dependency / no scoring**：不加入任何AI
  recommendation或scoring，`metadata`只帶純粹的版本標記資訊。
- **no external dependency**：完全不 import 任何非相對路徑的外部
  套件，不呼叫`fetch()`。

## 目前狀態

- `src/intelligence/index.js` 新增 `governance` namespace
  re-export。
- `src/bootstrap/application.js` 新增
  `application.intelligence.governance`，組裝
  `createGovernanceService()`實例——**純粹的依賴注入組裝**，不
  影響`intelligence.execution`/`intelligence.facade`的任何行為，
  `execution_manager.js`/`intelligence_facade.js`本次完全沒有被
  修改。
- Execution Manager、Orchestrator、Analysis、Recommendation、
  Service、Facade、Runtime Context、Contracts八者的原始碼**完全
  沒有被修改**——本次任務明確禁止觸碰它們。
- 完全沒有連接任何 route/controller/`worker.js`，也沒有新增任何
  D1/SQL/migration/UI——這是純粹的Phase 2 extension point，為
  Phase 3可能的治理控制預留邊界。
