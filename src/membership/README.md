# Premium Feature Boundary（Phase 6 TASK1.122）

## 目的

在Gemini Enhancement執行之前，建立一個可控的權限邊界，決定「這個
使用者能不能用這個功能」。本次任務**不**實作付款、**不**實作訂閱
計費、**不**串接任何第三方付款供應商——只建立機制本身。

```
User
  ↓
Identity（TASK1.118既有）
  ↓
Membership Resolver（這裡）
  ↓
Feature Permission Check（這裡）
  ↓
Gemini Enhancement（TASK1.121既有，完全不變）
  ↓
User Presentation
```

## 目錄結構

```
src/membership/
  README.md                本文件
  membership_state.js       Membership State形狀定義（free/premium/unknown）
  membership_resolver.js     Identity → Membership State
  feature_permission.js      Feature Permission Check（canUseFeature()）
  index.js                   統一輸出入口
```

## Membership State

```js
{ tier: "free" }
{ tier: "premium" }
{ tier: "unknown" }
```

明確不含：payment provider、transaction id、billing cycle、
subscription id、信用卡資訊。

## 目前的判斷規則（規格明確要求：本次任務不實作付費）

- 匿名/身份格式不合法 → `unknown`
- 已登入使用者，沒有真正的付費系統可以查 → `free`（目前系統的
  真實情況）
- 已登入使用者，且外部注入了`lookupTier(userId)`查詢函式 →
  依查詢結果決定（見下方"Future Payment Compatibility"）

## Feature Permission

```js
canUseFeature(identity, "gemini_enhancement")
```

| 身份 | 結果 |
|---|---|
| Premium | `true` |
| Free | `false` |
| Anonymous | `false` |

Permission邏輯**不**活在Gemini程式碼裡——`src/intelligence/
enhancement/gemini/`底下完全沒有任何檔案import這裡的任何東西，
呼叫順序是「Permission Boundary → Gemini Provider」，不是反過來。

## Health Insight Flow Integration

`src/routes/health_insight_routes.js`的POST `/api/health-insight`
handler在既有的`saveHealthInsightRecord()`之後，先呼叫
`canUseFeature(identity, 'gemini_enhancement', req.options)`；只有
回傳`true`才會呼叫TASK1.121既有的`enhanceHealthInsightResult()`。
被拒絕時**完全不會呼叫Gemini**（連API都不會打），使用者依然拿到
原本的Health Insight結果（`{html}`，不含`enhancedExplanation`）
——這是規格明確要求的"Gemini failure and permission denial must
not break Health Insight"在route層的具體落地。

`req.options`延續TASK1.13B/1.29起既有的「單一請求層級選填覆寫」
慣例（例如測試用的`now`），這裡把它原樣轉發成
`resolveMembershipState()`的`options`參數——Cloudflare Worker
真正的HTTP dispatch（`src/worker.js`）永遠只會傳空物件
`options: {}`，所以目前**沒有任何真實HTTP請求**能讓自己變成
premium，這個轉發只服務未來的付款系統／目前的測試需求。

## Future Payment Compatibility（規格明確要求，本次任務不實作）

```
Payment Provider
  ↓
Membership Update
  ↓
Feature Permission
```

未來要接上真正的付款系統時，只需要：
1. 在某個地方（例如新的`src/services/membership_service.js`，或
   D1新表）記錄「哪個userId是premium」
2. 呼叫`resolveMembershipState(identity, {lookupTier})`時，
   `lookupTier`改成真正查詢步驟1資料的函式

`membership_resolver.js`/`feature_permission.js`/
`src/routes/health_insight_routes.js`**完全不需要修改**——這就是
`options.lookupTier`延伸點存在的目的。

## 明確不做的事

- ❌ Stripe / 信用卡 / 訂閱續約 / 發票
- ❌ Billing資料庫（沒有新的migration，沒有新的D1表）
- ❌ 修改Capability Orchestrator / Analysis Runner /
  Recommendation Runner / Runtime
- ❌ 修改`src/intelligence/enhancement/gemini/`任何檔案（Gemini
  Provider本身完全不變，只是呼叫端多了一層權限檢查）
- ❌ 重新設計Health Insight UI / 付款頁面 / 升級頁面 / 定價頁面

## Current Limitations（目前限制）

- Membership完全是mocked——沒有任何真實使用者能夠變成premium，
  `canUseFeature()`在正常production流量下對所有已登入使用者都
  回傳`false`（Gemini enhancement目前對所有人都關閉，直到未來
  接上真正的付款系統）。
- 沒有`enhancedExplanationAvailable`之類的UI旗標——規格允許但不
  要求，本次任務刻意不新增，避免非必要的回應形狀變動。
