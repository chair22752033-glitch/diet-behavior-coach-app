# Intelligence Data Preparation Layer（Phase 1 TASK 1.41）

Phase 2 Intelligence Layer（TASK1.40）與既有 Domain Service Layer
（TASK1.15）之間的資料準備邊界。**本次任務不是AI功能開發**，目的是在
Insight Service 真正需要「使用者的完整資料情境」之前，先把「怎麼蒐集、
怎麼整理成穩定格式」這件事獨立出來，不讓這個責任散落到 Insight
Service、更不會讓它散落到 Controller 或未來的 AI Provider Adapter。

## 目錄結構

```
src/intelligence/data_preparation/
├── README.md
├── context_builder.js         # createContextBuilder()：buildContext(db, userId, options)
├── data_normalizer.js           # createDataNormalizer()：normalize(context)
└── index.js                       # 統一輸出入口 + createDataPreparationService()
```

## 分層位置

```
User Data
   ↓
Domain Services（TASK1.15，既有、本次完全不修改）
   ↓
Intelligence Data Preparation Layer（這裡）
   ↓
Insight Service（TASK1.40，本次完全不修改——尚未實際串接這一層）
   ↓
Analysis Engine / Recommendation Engine（TASK1.40）
```

目前**沒有任何 controller/route import 這個目錄**，`src/intelligence/
insight_service.js` 本次也完全沒有被修改成會呼叫這裡——這是純粹的
Phase 2 extension point，只有 `src/bootstrap/application.js` 會組裝出
`intelligence.dataPreparation`，供未來任務真正把 Insight Service 接上
這一層時使用。

## context_builder.js — `createContextBuilder()`

`buildContext(db, userId, options)` 負責「從既有五大 Domain Service
（exploration/food/emotion/behavior/report）蒐集原始資料」，回傳形狀：

```js
{
  ok: true,
  context: {
    user, explorations, foodEvents, emotions, behaviors, reports,
  },
}
```

完全重用 TASK1.15 既有的 `getUserExplorations()`/`listFoodHistory()`/
`listEmotionHistory()`/`getBehaviorPatterns()`/`getReports()` 與
`requireActiveUser()`（跟 `dashboard_service.js`/`timeline_service.js`
同樣的重用手法，不重新實作任何一行查詢邏輯），用 `Promise.all()` 平行
取得五個來源；任何一個來源失敗，整個 context 視為建立失敗，不會用
「部分資料 + 靜默省略」的方式回傳。

**規則**：
- `userId` 一律由呼叫端（未來的 Insight Service 或更上層）當作獨立
  參數傳入，這裡完全不知道 session/cookie 是什麼
- 不處理 HTTP（不知道 Request/Response）
- 不直接操作 SQL（不 import `src/db/` 底下任何檔案）
- 只透過既有 Domain Service 取得資料

## data_normalizer.js — `createDataNormalizer()`

`normalize(context)` 把 `context_builder.js` 產生的原始 context 轉成
穩定、可預期的 intelligence input 格式：

```js
{
  user: {id, isGuest, authProvider, status, createdAt} | null,
  explorations: {count, items},
  foodEvents: {count, items},
  emotions: {count, items},
  behaviors: {count, items},
  reports: {count, items},
}
```

**規則**（規格明確要求）：
- **deterministic output**：同樣的輸入永遠得到完全相同的輸出，完全
  是純函式，不讀取 `Date.now()`/`Math.random()`/任何外部狀態
- **no AI logic**：不做任何推論、分類、摘要
- **no recommendation logic**：不產生任何建議
- **no scoring unless already existing domain data provides it**：
  不自己計算任何新的分數——`behavior_patterns` 既有的
  `confidence_score` 欄位只是隨著 `items` 原樣被 shallow copy 保留
  下來（因為那是 domain 資料本來就有的欄位），這裡完全不會讀取它、
  加總它、或用它做任何進一步計算
- `user` 欄位刻意只保留分析情境下有意義、不涉及帳號安全的欄位子集
  （呼應 `profile_service.js` 既有的白名單輸出設計），排除
  `auth_provider_id`/`legacy_sync_code`/`updated_at`/`last_login_at`
  等實作細節欄位

## index.js — `createDataPreparationService()`

把 Context Builder 跟 Data Normalizer 組合成單一入口：

```js
const service = createDataPreparationService();
const result = await service.prepare(db, userId, { limit: 50 });
// result: {ok:true, context: <normalize()後的格式>} 或 {ok:false, reason/error}
```

`prepare()` 先呼叫 `buildContext()`，成功時才進一步 `normalize()`；
任何一步失敗都直接回傳失敗結果，不會用未 normalize 的原始資料頂替。

## 安全原則（跟 Domain Service Layer / Intelligence Layer 一致）

一律不允許：

- ❌ SQL / `db.prepare()` / 任何 D1 操作（不 import `src/db/` 底下任何檔案）
- ❌ HTTP 處理（不知道 Request/Response 是什麼）
- ❌ Session 邏輯（不 import `src/auth/` 或 `src/identity/`）
- ❌ 任何 AI API 呼叫（不呼叫 `fetch()`、不 import 任何 AI SDK）
- ❌ 修改任何一個既有 Domain Service 的行為

## Bootstrap Integration

`src/bootstrap/application.js` 的 `intelligence` namespace 新增
`dataPreparation`：

```js
{
  insightService, analysisEngine, recommendationEngine,
  dataPreparation: { buildContext, normalize, prepare },
}
```

跟 `insightService`/`analysisEngine`/`recommendationEngine` 一樣，每次
`createApplication(env)` 呼叫都重新建立獨立實例。**目前沒有任何
route/controller 讀取 `app.intelligence.dataPreparation`**，`insight_
service.js` 本次也沒有被修改成會使用它——純粹是組裝好、放在那裡供
未來任務使用。

## 測試方式

`backups/phase1-task1.41-intelligence-data-preparation/test_intelligence_data_preparation.mjs`：
純記憶體測試，完全不連線任何真實或本機模擬的資料庫，不呼叫任何 AI API
或 `fetch()`，不建立任何真實使用者 session。
