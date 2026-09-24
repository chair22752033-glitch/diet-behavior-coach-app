# Intelligence Runtime Context Layer（TASK 1.49）

## 目的

引入一個受控的「Intelligence執行期上下文」邊界，把「這次執行的執行期
資訊」（requestId/version/timestamp/metadata）跟「業務輸入」
（userId/options）明確分開，同時完全不修改既有pipeline的行為——
Orchestrator/Analysis/Recommendation/Data Preparation四層對Runtime
Context一無所知，也不需要知道。

**這個任務不是 AI 功能開發**：Runtime Context Builder只做「套預設值
+ 驗證形狀」，完全不做任何推論、分類、摘要、建議。

## 架構位置

```
Consumer
  ↓
Intelligence Facade（TASK1.48）── 建立Runtime Context，跟request一起傳遞
  ↓
Intelligence Service（TASK1.46）
  ↓
Execution Contract（TASK1.47）
  ↓
Intelligence Orchestrator（TASK1.45）
  ↓
Intelligence Pipeline
```

## 檔案

- `runtime_context.js`：`RuntimeContextContract`
  `{required:['userId'], optional:['requestId','version','timestamp','metadata']}`，
  `validateRuntimeContext(context)`只驗證架構（`userId`必填非空
  字串；`requestId`/`timestamp`選填但存在時必須是字串或null；
  `version`選填但存在時必須是字串；`metadata`選填但存在時必須是
  物件），回傳`{ok:true, context}`或`{ok:false, reason, field?}`。
- `runtime_context_builder.js`：`createRuntimeContext(input)`——把
  `input`裡缺少的欄位套上固定預設值（`requestId:null`,
  `version:"1"`, `timestamp:null`, `metadata:{}`），再呼叫
  `validateRuntimeContext()`確認形狀，回傳跟`validateRuntimeContext()`
  相同的`{ok, context}`/`{ok:false, reason}`格式。純函式，完全不讀取
  `Date.now()`/`Math.random()`——`timestamp`刻意不在這裡內部產生，
  沒有提供時安全預設為`null`，不猜測、不使用目前時間。
- `index.js`：統一輸出上述contract跟建構函式。

## 規則

- **deterministic output**：同樣的輸入，任何時候呼叫都得到完全相同的
  輸出。
- **no database access**：不 import `src/db/` 底下任何檔案，這個
  目錄底下所有函式甚至不接受db參數。
- **no HTTP**：不知道 Request/Response 是什麼。
- **no authentication parsing**：不 import `src/auth/` 或
  `src/identity/`；`userId` 一律由呼叫端當作獨立欄位傳入。
- **no AI logic**：不做任何推論、分類、摘要、建議。

## 跟 Intelligence Facade 的整合

`src/intelligence/facade/intelligence_facade.js` 的
`executeIntelligence(db, request)` 在驗證完facade輸入之後，會呼叫
`createRuntimeContext({userId: request.userId, requestId:
request.requestId, version: request.version, timestamp:
request.timestamp, metadata: request.metadata})` 建立Runtime
Context，驗證失敗時立刻回傳失敗結果。建立成功後，Runtime Context會
跟業務request**一起**（合併進轉交給Service的`options.runtimeContext`
欄位）傳給`service.getIntelligence()`——這是刻意選擇的傳遞方式：
`options`本來就是Execution Contract（TASK1.47）允許帶有未知額外欄位
的自由欄位，讓Runtime Context可以原樣一路往下流動，而完全不需要
修改`intelligence_service.js`、Execution Contract、Orchestrator、
Analysis、Recommendation、Data Preparation任何一行邏輯——這幾層仍然
完全不知道Runtime Context這個概念存在，只是多帶著一個目前沒有人讀取
的欄位往下傳，對既有pipeline行為零影響。

Facade建立Runtime Context這件事本身完全符合「Facade may create
runtime context」的規則——建立過程是純函式運算（`createRuntimeContext()`
不接受db參數、不做任何HTTP/AI呼叫），facade依然只呼叫
`service.getIntelligence()`一個下游介面，完全沒有繞過去直接存取
Database或呼叫Orchestrator/Analysis/Recommendation。

## 目前狀態

- `src/intelligence/index.js` 新增 `runtime` namespace re-export。
- `src/intelligence/facade/intelligence_facade.js` 新增
  `createRuntimeContext()`呼叫（見上方「跟Intelligence Facade的
  整合」），`executeIntelligence()`對外可觀察的成功/失敗回傳格式
  完全沒有改變。
- Orchestrator（`src/intelligence/orchestration/`）、Analysis Runner
  （`src/intelligence/analysis/`）、Recommendation Runner
  （`src/intelligence/recommendation/`）、Data Preparation
  （`src/intelligence/data_preparation/`）四者的原始碼**完全沒有被
  修改**——本次任務明確禁止觸碰它們。
- `src/bootstrap/application.js` 本次**不需要修改**——Runtime Context
  Builder是純函式工具，由`intelligence_facade.js`內部import使用，
  不是需要額外組裝的獨立子層實例。
