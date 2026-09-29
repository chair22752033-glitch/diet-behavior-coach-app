# Health Product Architecture Alignment（Phase 6 TASK1.125）

## 目的

TASK1.111~1.124已經把Health Insight從「架構規劃」一路做到
「完整的第一版產品體驗」——Feature Foundation、Product
Integration、UI/UX、真實Product Flow、Response Boundary、
User Identity、OAuth Binding、Persistence、Gemini Enhancement、
Premium Feature Boundary、Product Experience Upgrade、Product
Completion，共14個任務、14份測試套件、目前全部0 failed。

本次任務**不新增任何功能、不重新設計既有架構、不建立任何route/
controller/UI**——純粹是**架構對齊審查**：把過去14個任務實際
落地的東西，拿去對照規格最初給的Original Product
Requirements，確認：

1. 現有架構有沒有撐住原始產品願景要求的四件事（既有結構保留/
   使用者體驗/商業化方向/雙軌驗證策略）？
2. User Lifecycle（Guest → Registered Free → Premium）跟六層
   Product Layers鏈路，現在的程式碼**真的**支援到什麼程度？
3. 哪些地方是「規劃了但還沒做」？哪些地方是「做了但跟最初設想
   有落差」？
4. 為了接下來的下兩個產品開發階段，現在最該優先處理的缺口是
   什麼？

這份文件是**現況盤點**，不是新的設計——每一個結論都對應到
`src/`底下實際存在的檔案跟已經通過的測試套件，不是假設或
待辦清單。驗證方式見`backups/phase6-task1.125-product-architecture-alignment/
test_health_insight_product_architecture_alignment.mjs`。

---

## Validation Goals A：User Lifecycle

規格要求驗證的生命週期：

```
Guest
  ↓
Registered Free
  ↓
Premium User
```

現況對照：

| 階段 | 對應的程式碼現況 | 支援程度 |
|---|---|---|
| **Guest**（訪客，未登入） | `ANONYMOUS_IDENTITY`（`src/identity/health_insight/user_identity.js`）——`authenticated:false`，Health Insight完整可用（Input→Analysis→Recommendation→Dashboard），Gemini鎖定，History/Progress顯示登入引導，**完全不觸發任何D1寫入**（`shouldPersistHealthInsightRecord()`明確排除） | ✅ 完整支援 |
| **Registered Free**（已登入、免費層） | 已登入使用者（`authenticated:true`）預設`resolveMembershipState()`回傳`{tier:'free'}`——可以存歷史紀錄（`saveHealthInsightRecord()`）、可以查歷史（`GET /api/health-insight/history`）、可以看到方向比較（Progress Summary Card），但`isFeatureAllowedForTier()`要求`premium`才能用`gemini_enhancement`，free被明確擋下 | ✅ 完整支援 |
| **Premium User**（付費層） | Membership State的形狀跟判斷邏輯完整（`MEMBERSHIP_TIERS.PREMIUM`），`canUseFeature(identity, 'gemini_enhancement', options)`在`options.lookupTier()`回傳`'premium'`時正確解鎖Gemini陪伴解讀——**但`src/worker.js`真正的HTTP dispatch永遠只傳空的`options:{}`給這條route**，代表目前沒有任何真實付款/會員系統會產生這個`lookupTier`，Premium在正式環境裡是"準備好但打不開的門" | ⚠️ 機制完整，**沒有真實觸發管道**（見下方第3節） |

三階段的**形狀**跟**邊界判斷邏輯**在程式碼裡都已經存在且都有
測試覆蓋（Membership State/Feature Permission/Persistence
Ownership三層各自獨立測試過），差的只是「Premium怎麼變成
premium」這一步——這正是規格本身在TASK1.106~1.124反覆確認的
"Premium users prepared but not attainable yet"既有結論，本次
審查再次確認這個結論到TASK1.124為止依然成立，沒有任何一個
後續任務意外打開這道門。

---

## Validation Goals B：Product Layers

規格要求驗證的六層鏈路：

```
App Experience Layer
  ↓
Product Layer
  ↓
Intelligence Layer
  ↓
AI Enhancement Layer
  ↓
Persistence Layer
  ↓
Membership Layer
```

現況對照（實際檔案路徑）：

| 層 | 實際對應目錄/檔案 | 現況 |
|---|---|---|
| **App Experience Layer** | `src/worker.js`（3個Health Insight if區塊）→ `src/routes/health_insight_routes.js` → `src/ui/health_insight/`（`pages/`、`components/`、`design_system/`、`assets/`、`client/`） | 完整：Input Experience（問題卡片式輸入）+ Dashboard（洞察/建議/Gemini/歷史/進度五種卡片） |
| **Product Layer** | `src/controllers/health_insight_controller.js` + `src/intelligence/product/health_insight_integration.js`（統籌`entry/`→`contract/`→`adapter/`→`execution/`→`operational/`→`features/health_insight/`） | 完整：沿用Phase 5既有五個Product Boundary，Health Insight是第一個真正接上去的Product Feature |
| **Intelligence Layer** | `src/intelligence/capabilities/{orchestration,analysis,recommendation}/` + `src/intelligence/analysis/analysis_runner.js` + `src/intelligence/recommendation/recommendation_runner.js` | 完整但維持V1範圍：Health Observation/Recommendation有實際內容，Behavior Pattern/Progress Trend/Decision維持規格明確允許的"概念存在、V1不產生內容"預留狀態 |
| **AI Enhancement Layer** | `src/intelligence/enhancement/gemini/`（`gemini_client.js`/`gemini_provider.js`/`gemini_enhancer.js`）+ `src/intelligence/enhancement/provider/ai_provider_contract.js` + `src/config/gemini_config.js` | 完整：不是智慧來源，只是把Intelligence Layer已經產生的結構化結果改寫成口語化說明；技術性失敗/沒設定金鑰時安靜降級，不影響Health Insight本身 |
| **Persistence Layer** | `src/persistence/health_insight/health_insight_persistence_service.js` + `src/db/tables/health_insight_records.js`（`health_insight_records`表，TASK1.120新增，唯一一次D1 migration） | 完整：只有已登入使用者才寫入，只存White-list過的欄位快照，D1 schema自TASK1.120起沒有再變過 |
| **Membership Layer** | `src/membership/`（`membership_state.js`/`membership_resolver.js`/`feature_permission.js`） | 完整：Free/Premium/Unknown三態形狀完整，`canUseFeature()`是唯一的Permission入口，但沒有真正的付款系統接在`resolveMembershipState()`的`options.lookupTier`上 |

**額外發現**：TASK1.124新增的`src/history/health_insight/`
（`history_service.js`/`index.js`，History
Retrieval Boundary）**不在**規格原本列出的六層清單裡——它是
Persistence Layer跟App Experience Layer之間新增的一層讀取
邊界（"User Identity → History Service → Persistence
Layer"），角色類似Membership Layer之於Feature
Permission：**不新建資料、只重新包裝既有資料的讀取路徑**。這層
補足了規格六層鏈路圖沒有明講、但User Journey（"Return later →
View previous records"）確實需要的一塊，建議往後把它視為
Persistence Layer的**讀取side-car**，不需要因此改動六層圖本身。

六層鏈路的**呼叫方向**完全單向（App→Product→Intelligence→
Persistence，Membership/AI Enhancement各自從Route層被獨立呼叫，
不是彼此的下游）——沒有任何一層反向import上層，這是TASK1.111
起每個任務的Architecture Protection測試都在重複驗證的既有結論，
本次審查抽樣確認到TASK1.124依然成立。

---

## 1. Current Architecture Status（現況總覽）

- **已完成的14個任務**：TASK1.111 Feature Foundation、1.112
  Product Integration、1.113 User Activation、1.114 UI/UX
  Foundation、1.115 拙趣 Visual Integration、1.116 Real Product
  Flow、1.117 Response Boundary、1.118 User Identity Foundation、
  1.119 OAuth Identity Binding、1.120 Persistence Foundation、
  1.121 Gemini Enhancement Layer、1.122 Premium Feature
  Boundary、1.123 Product Experience Upgrade、1.124 Product
  Completion。
- **路由現況**：`app.router.routes.length === 24`——3條
  Health Insight路由（`GET /health-insight`、
  `POST /api/health-insight`、`GET /api/health-insight/history`）
  +既有21條（auth/user/data/dashboard/profile/timeline）。
- **D1現況**：7個既有migration檔案，只有一個
  （`0007_phase6_task1_120_health_insight_records.sql`）屬於
  Health Insight，自TASK1.120後沒有再變過schema。
- **`app.intelligence`現況**：維持24個既有欄位，Health Insight
  沒有在這個物件上新增任何欄位（它是透過獨立的Product
  Integration/Route掛上去的，不是`app.intelligence`的一部分）。
- **測試現況**：14個套件、每個都獨立可執行、每次新任務都會
  重新跑一次完整的Health Insight lineage回歸（目前1.111~1.124
  全部0 failed），外加P1-P6既有UI Playwright檢查確認完全沒有
  動到Legacy UI。
- **視覺現況**：拙趣風格（角色插畫+手繪底線+暖色調）從
  TASK1.115建立後沒有再變過設計系統本身（`design_tokens.js`/
  `asset_registry.js`皆為PROTECTED_FILES），TASK1.123/1.124的
  新卡片全部重用既有token，沒有新增CSS。

## 2. Original Requirement Mapping（原始需求對應）

規格列出的四項Original Product Requirements，逐項對照：

### 需求1：Preserve existing structure and intelligence architecture

✅ **完全達成**。Intelligence Layer核心檔案
（`analysis_runner.js`/`recommendation_runner.js`/三個
Capability index.js/Product Boundary五個目錄）從TASK1.111起
被列在每個任務的PROTECTED_FILES清單裡，14個任務、14次
Architecture Protection測試，零diff。

### 需求2：Build user experience based on existing product structure（UI/UX/buttons/interface/user journey/visual presentation）

✅ **完全達成**。UI/UX從TASK1.114 Foundation、TASK1.115視覺
整合、到TASK1.123/1.124補上Gemini/Premium/History/Progress
呈現，完整的User Journey（New user/Existing user兩條）在
TASK1.124已經端對端驗證。Buttons/interface目前是`<button
type="button">`純樣式CTA（`data-hi-action`標記行動意圖，未綁定
真正互動邏輯）——這是規格從TASK1.114起就明確要求的"建立但不
接線"既有模式，不是遺漏。

### 需求3：Move toward commercialization（AI integration/free premium model/user lifecycle/future monetization）

⚠️ **機制完整，商業化本身未啟動**（見下方第4節詳細分析）。
AI Integration（Gemini）、Free/Premium Model（Membership
Layer）、User Lifecycle（Guest/Free/Premium三態）三者的**形狀
跟判斷邏輯**都已經落地，但"讓使用者真的變成付費會員"這個
動作——也就是Future Monetization本身——完全沒有實作，也不
應該在Phase 6實作（規格從TASK1.122起就明確禁止Payment/
Subscription/Billing/Stripe）。

### 需求4：Authentication strategy（Guest vs Google authenticated）

⚠️ **部分對齊，有一個明確的語意落差**（見下方第3節）。目前的
Identity Layer區分的是「匿名（完全沒登入）」vs
「已登入（`authenticated:true`，`provider`可能是`'google'`或
既有Phase 1就存在的`'guest'`帳號類型）」，這跟TASK1.125規格
描述的「Guest users」vs「Google authenticated users」二分法，
在命名上會撞在一起——細節見第3節。

## 3. Missing Product Capabilities（缺口清單）

按影響程度排序：

### 3.1（語意落差，優先）Health Insight的「已登入」判斷沒有區分Google vs 既有Guest帳號

`buildUserIdentity()`（`src/identity/health_insight/
user_identity.js`）把Phase 1既有的「訪客帳號」（`is_guest:1`，
TASK1.14起就存在、有真實D1 user row跟session的完整功能帳號）
轉成`{authenticated:true, provider:'guest'}`——跟Google登入
使用者的`{authenticated:true, provider:'google'}`只有
`provider`欄位不同，**在`shouldPersistHealthInsightRecord()`/
`resolveMembershipState()`等等所有Health Insight判斷邏輯裡，
兩者被完全同等對待**：既有的Guest帳號一樣會被存歷史紀錄、一樣
能查`GET /api/health-insight/history`、一樣能透過
`options.lookupTier`變成Premium。

這跟本次規格的Authentication Strategy明確寫的「Guest users:
no persistent record, no personalized usage」有落差——規格
設想的"Guest"應該是**不會**被存歷史紀錄的一層，但目前程式碼
唯一真正"不存歷史"的狀態是`ANONYMOUS_IDENTITY`（完全沒有
session的訪客），而不是Phase 1那個已經有帳號、只是沒有綁
Google的"Guest"帳號。

**這不是bug**——Phase 1的Guest帳號本來就被既有系統定義為
"完整功能帳號"（`src/identity/health_insight/user_identity.js`
檔案頭原文："訪客是完整功能帳號，不是匿名狀態"），Health Insight
延續這個既有結論是正確的重用既有邊界的做法。但這代表**規格
最初設想的三層User Lifecycle，實際上目前只有兩個判斷維度
（有沒有session / tier是free還是premium），"是不是Google"這個
維度目前完全沒有被使用**。是否要讓"Guest帳號"變成真正的第三種
持久化層級，還是維持現狀（Guest帳號視同Free），是下一個產品
階段需要**產品面**（不是架構面）決定的事，本次任務不擅自決定，
只在此記錄。

### 3.2 Premium沒有真實觸發管道

`resolveMembershipState()`的`options.lookupTier`是唯一能讓
使用者變成`premium`的管道，但`src/worker.js`的三條Health
Insight route dispatch永遠只傳空的`options:{}`——代表**正式
環境目前沒有任何方式讓真實使用者變成Premium**。這是TASK1.122
就已經記錄的既定設計（"Premium users prepared but not
attainable yet"），本次審查確認到TASK1.124為止依然成立，不是
新發現的缺口，但明確是進入"commercialization"階段前必須處理
的第一件事。

### 3.3 Behavior Pattern / Progress Trend兩個Intelligence輸出類別仍是V1佔位

`behavior_pattern_card.js`跟progress概念裡"trend"（不是
TASK1.124新增的Progress Summary Card，那是比對輸入快照，不是
Intelligence產生的trend）依然是規格V1明確允許的固定預留卡片。
這不是架構缺陷，是Intelligence Layer本身V1範圍就沒有產生這兩類
內容（`behaviorPattern`永遠是空陣列、`progressTrend`永遠是空
物件），UI層忠實反映這個事實。

### 3.4 Input Experience的按鈕/問題卡片尚未接上真正的提交互動邏輯細節

`src/ui/health_insight/client/interaction_script.js`（TASK1.116
起存在）負責前端互動，但UI元件本身（`question_card.js`的
選項卡片、CTA按鈕）仍是規格明確要求的"建立但不接線"樣式層——
不是缺口，是既定範圍。

## 4. Commercialization Readiness（商業化就緒度）

| 商業化要素 | 就緒度 | 說明 |
|---|---|---|
| Free/Premium資格判斷 | 🟢 就緒 | `feature_permission.js`的`FEATURE_TIER_REQUIREMENTS`是一個可擴充的映射表（目前只有`gemini_enhancement: 'premium'`一筆），未來新增付費功能只需要加一行 |
| Membership State形狀 | 🟢 就緒 | `{tier: 'free'|'premium'|'unknown'}`跟外部付款系統的實際實作方式完全解耦 |
| 付款/訂閱/計費 | 🔴 未開始（規格明確禁止在Phase 6實作） | 需要新的Payment Provider整合、webhook接收、訂閱狀態同步——這些完全不存在，也不應該存在於目前的程式碼裡 |
| 使用者升級流程（UI） | 🟡 部分就緒 | `gemini_insight_card.js`鎖定文案已經區分"匿名→登入"跟"已登入→升級會員"兩種引導語，但**沒有任何連結**（規格明確禁止在Health Insight卡片裡放付款頁連結），真正的升級入口需要在App層級（不是Health Insight層級）另外設計 |
| 使用量控管/額度 | 🔴 未規劃 | 目前`canUseFeature()`是純粹的tier二元判斷，沒有"每月N次"這類額度概念——如果未來的定價模型需要額度制，`feature_permission.js`需要擴充（不影響現有呼叫端） |
| 多功能付費矩陣 | 🟡 部分就緒 | `FEATURE_TIER_REQUIREMENTS`目前只映射一個功能，架構上可以線性擴充成多功能/多tier矩陣，但實際的定價策略（哪些功能屬於哪個tier）是產品決策，不是本次任務範圍 |

**結論**：Membership/Feature Permission這一層的**架構**已經
為商業化做好準備，缺的是**外部世界**（真正的付款系統、真正的
升級UI入口、真正的使用量控管）——這些刻意留給規格說的"接下來
兩個產品開發階段"，不屬於Phase 6。

## 5. AI Expansion Readiness（AI擴充就緒度）

| AI擴充方向 | 就緒度 | 說明 |
|---|---|---|
| 更換/新增AI Provider | 🟢 就緒 | `ai_provider_contract.js`定義了`isValidAiProvider()`這個抽象契約，`gemini_provider.js`只是其中一個實作；理論上可以新增`openai_provider.js`之類的檔案實作同一份contract，不需要動`gemini_enhancer.js`的呼叫端邏輯（但目前`enhanceHealthInsightResult()`是硬編碼呼叫Gemini，真正的Provider切換需要在這裡加一層選擇邏輯） |
| 擴大AI使用範圍（不只是Enhancement文字） | 🟡 部分就緒 | 目前Gemini只做"把結構化結果改寫成口語化說明"這一件事，輸入輸出邊界（`buildEnhancementInput()`/Output Boundary）已經是獨立步驟，理論上可以在同樣的邊界模式下新增其他AI用途（例如摘要/建議排序），但每個新用途都需要各自的Input/Output Boundary，不是自動泛化的 |
| Permission精細度 | 🟢 就緒 | `canUseFeature(identity, featureName)`的`featureName`是字串鍵值，新增AI功能只需要新的`featureName`常數+`FEATURE_TIER_REQUIREMENTS`一行 |
| 失敗處理/安全邊界 | 🟢 就緒 | "AI失敗不能中斷產品"跟"不外洩API錯誤/model資訊"這兩個原則已經在`gemini_enhancer.js`/`gemini_insight_card.js`兩層都有落地並測試覆蓋，任何新的AI功能延續同一個模式即可 |
| 使用量/成本控管 | 🔴 未規劃 | 目前沒有任何呼叫次數統計/成本追蹤機制——`GEMINI_API_KEY`一旦設定，Premium使用者的每次請求都會觸發一次真實API呼叫，沒有rate limit/quota |

**結論**：AI Enhancement Layer的**邊界模式**（Provider
Contract、Permission Gate、Failure Isolation、Output
Sanitization）已經成熟到可以複製貼上做下一個AI功能，但**還沒有
使用量控管**，如果下一階段要開放給更多Premium使用者，這是需要
補上的第一塊。

## 6. UI/UX Expansion Direction（UI/UX擴充方向）

延續拙趣風格，目前Dashboard五張卡片（觀察/建議/Gemini/行為
模式/進度方向/陪伴紀錄，共六張）已經確立了一致的視覺語言
（`.hi-card`/`.hi-placeholder-card`/`createCardHeader()`/
`createCardCta()`），未來擴充建議：

- **新卡片重用既有排版元件**：`createIllustration()`/
  `createCardHeader()`/`createCardCta()`三個輔助函式已經足以
  組出任何新卡片，不需要新的排版基礎設施。
- **插畫資產需要規劃**：目前7張角色插畫+3張手繪底線都是使用者
  提供的既有素材，新功能如果需要新的情境插畫（例如"付費升級"
  情境、"歷史紀錄詳細檢視"情境），需要先取得對應素材，不能用
  AI生成（延續整個系列的既有限制）。
- **CTA按鈕真正接線**：目前所有`data-hi-action`按鈕都只是
  樣式層，下一階段如果要讓使用者真的能點擊互動（例如展開
  歷史紀錄詳情、觸發升級流程），需要在
  `interaction_script.js`新增對應的事件處理，這是目前唯一
  "看得到、還沒做"的UI/UX缺口。
- **歷史紀錄目前只有摘要列表，沒有詳細檢視頁**：
  `history_card.js`只顯示`M/D · 健康目標`這種一行摘要，沒有
  點進去看單筆完整內容的頁面——如果產品需要，這是一個新的
  App Experience Layer畫面，不影響現有六層架構。

## 7. Guest to Registered Conversion Flow（訪客轉換流程）

現況的轉換路徑（純粹重用既有Auth Layer，Health Insight沒有
建立任何新的登入機制）：

```
匿名訪客（ANONYMOUS_IDENTITY）
  ↓ 使用Health Insight（Input→Dashboard），完整體驗，Gemini鎖定，History/Progress顯示登入引導
  ↓
使用者選擇登入（既有 /auth/provider 或 /auth/guest，Health Insight本身不提供登入UI）
  ↓
下一次呼叫 POST /api/health-insight 時，req.cookieHeader 帶有效session
  ↓
resolveHealthInsightIdentity() 解析出 {authenticated:true, userId, provider}
  ↓
saveHealthInsightRecord() 開始真正寫入 D1
  ↓
GET /api/health-insight/history 開始看得到紀錄；Progress Summary Card開始比較"這次vs上一次"
```

**關鍵設計**：這個轉換**沒有任何"中斷點"**——匿名使用者在
任何時候登入，下一次提交就自動開始累積歷史，不需要"匯入舊
資料"這種額外步驟（因為匿名狀態本來就不存任何資料，沒有東西
需要匯入）。這是規格"Anonymous users must NOT create fake
identities"跟"Guest users: no persistent record"兩個原則自然
推導出的結果，不是額外設計的功能。

**目前唯一的落差**（呼應第3.1節）：如果使用者選擇的是既有系統
的"Guest帳號登入"（`/auth/guest`，不是Google），會立刻被視為
`authenticated:true`，立刻開始累積歷史——沒有經過規格描述的
"Guest users: no persistent record"這一關。這個轉換流程圖對
"Google登入"完全準確，對"既有Guest帳號登入"則會提早一步。

## 8. Free vs Premium Boundary（Free/Premium邊界）

| 面向 | Free | Premium |
|---|---|---|
| Health Insight基本功能（觀察/建議） | ✅ 完整 | ✅ 完整（跟Free完全相同，Permission不影響核心結果） |
| 歷史紀錄（History Card） | ✅ 可用 | ✅ 可用（跟Free完全相同，History跟Premium無關） |
| 進度方向（Progress Summary Card） | ✅ 可用 | ✅ 可用（跟Free完全相同，Progress跟Premium無關） |
| Gemini陪伴解讀 | ❌ 鎖定（顯示"升級會員即可解鎖"引導） | ✅ 可用 |
| 邊界判斷位置 | `canUseFeature(identity, 'gemini_enhancement', options)`——`src/membership/feature_permission.js`，單一入口 |
| 邊界外洩防護 | 兩層都不外洩：Route層被拒絕時完全不呼叫Gemini API（連網路請求都不會發生）；UI層`gemini_insight_card.js`只顯示中性文字，不提任何"付款"/"訂閱"字樣或連結 |

**設計上的關鍵原則**（本次審查確認依然成立）：**Free/Premium的
邊界只框住"AI陪伴解讀"這一個功能，不框住Health Insight本身**
——這是從TASK1.122第一次建立Membership Layer時就定下的
產品決策，本次規格的"Free user: Basic Health Insight works"
再次確認了這個決策是對的方向：核心產品價值（健康洞察）對所有
使用者一致，Premium只是"加值"，不是"解鎖基礎功能"。

---

## Restrictions Confirmation（限制確認）

- ❌ 本次任務**沒有**建立任何新TASK。
- ❌ 本次任務**沒有**重新設計任何既有架構——Intelligence/
  Capability/Runtime/Persistence/Membership/Gemini
  Provider/UI設計系統全部維持TASK1.124結束時的狀態，零diff。
- ❌ 本次任務**沒有**新增任何不相關功能——唯一新增的檔案是這份
  文件本身跟對應的測試套件。
- ✅ 本次任務確認了User Lifecycle（Guest/Free/Premium）跟六層
  Product Layers鏈路的現況，記錄了3.1~3.4四個缺口跟4/5/6/7/8
  五個方向的就緒度評估，供接下來的下兩個產品開發階段參考。

## Completion Criteria 確認

- ✅ `PHASE6_PRODUCT_ALIGNMENT.md`已建立，涵蓋規格要求的8個
  章節（Current architecture status/Original requirement
  mapping/Missing product capabilities/Commercialization
  readiness/AI expansion readiness/UI/UX expansion
  direction/Guest to Registered conversion flow/Free vs
  Premium boundary）。
- ✅ User Lifecycle（Guest→Registered Free→Premium User）三個
  階段的現況已對照確認。
- ✅ 六層Product Layers（App Experience/Product/Intelligence/
  AI Enhancement/Persistence/Membership）的現況已對照確認，並
  記錄了History Retrieval Boundary這個規格原圖沒有明講的額外
  讀取層。
- ✅ 既有架構（Intelligence/Capability/Runtime/Persistence/
  Membership/Gemini Provider/UI設計系統）維持零diff，本次任務
  沒有修改任何一行既有production程式碼。
