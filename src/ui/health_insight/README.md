# Health Insight UI/UX Implementation Foundation（Phase 6 TASK1.114，TASK1.115更新視覺資產整合，TASK1.116更新Product Activation）

## 目的

在Phase 6產品架構（TASK1.106~1.113）完成之後，建立Health
Insight**第一個使用者可見**的UI/UX基礎——視覺結構、元件基礎、
設計系統、互動基礎、未來資產整合邊界。TASK1.114/1.115本身
**不**整合Gemini、**不**修改Intelligence架構、**不**產生最終
插畫資產、**不**建立route/controller、**不**把這些檔案接進
worker.js——這些限制到TASK1.116才第一次解除（見下方"TASK1.116
更新"），但TASK1.116同樣**不**整合Gemini、**不**修改
Intelligence架構、**不**重新設計視覺呈現。

## TASK1.115更新：真實插畫資產整合

TASK1.114建立時，所有插畫插槽都是emoji佔位符（🌱/🔍/🌤️等）。
TASK1.115收到使用者親自提供的八張「拙趣風格」Health
Insight參考圖（角色設定圖、Dashboard/Input Experience手機
模擬圖、五格表情速寫、圖示素材表），用`sharp`函式庫做純粹的
影像裁切/去背/壓縮處理（不是AI生成新圖片），把這些**使用者
提供的既有素材**整理成七張角色插畫+三張手繪底線，放進
`assets/illustrations/`，`ASSET_REGISTRY`從emoji佔位符升級成
真正的檔案路徑。詳見`assets/asset_registry.js`檔案頭說明的
"一般檔案路徑 vs base64"技術決策，以及
`DESIGN_SPECIFICATION.md`的完整視覺規格分析。

## 為什麼是「拙趣」風格

延續本次任務的Design Direction：Health Insight不應該看起來像
傳統醫療儀表板。核心原則是"陪伴使用者理解自己"，不是"監控使用者
健康數據"——溫暖、手感、簡單但好記、像朋友陪伴、降低對健康
追蹤的焦慮感。詳細的顏色/字體/間距方向見
`design_system/design_tokens.js`檔案頭說明。

## 目錄結構

```
src/ui/health_insight/
  DESIGN_SPECIFICATION.md  TASK1.114-A視覺分析規格（TASK1.115落地依據）
  design_system/
    design_tokens.js       設計系統基礎（顏色/字體/間距/卡片樣式/斷點）
  assets/
    asset_registry.js      插畫資產整合邊界（語意插槽 + 真實檔案路徑，TASK1.115更新）
    README.md
    illustrations/         TASK1.115新增：七張角色插畫+三張手繪底線（真實檔案）
    placeholders/          預留目錄，尚未使用
  components/
    html_utils.js          HTML escape工具
    label_map.js           呈現層措辭對照表（type代碼 → 友善中文標籤）
    illustration.js        TASK1.115新增：插畫<img>標籤產生器
    card_header.js          TASK1.115新增：標題+手繪底線共用排版
    card_cta.js             TASK1.115新增：卡片底部行動小標籤共用排版
    health_summary_card.js Today's Insight Summary
    observation_card.js    Health Observation Card（TASK1.115：改為單卡清單結構）
    recommendation_card.js Recommendation Card（TASK1.115：改為單卡清單結構）
    behavior_pattern_card.js  Behavior Card Placeholder
    progress_card.js       Progress Card Placeholder
    question_card.js       Input Experience的引導式問題卡片（TASK1.115：邊框式卡片+四色循環chip）
    error_card.js          Error Presentation
    index.js
  pages/
    dashboard_page.js      組裝完整Health Insight Dashboard（TASK1.115：新增標題區塊）
    input_page.js          組裝完整Input Experience畫面（TASK1.115：新增標題區塊+送出按鈕）
  client/
    interaction_script.js  TASK1.116新增：瀏覽器端互動腳本（純字串，chip選取/輸入狀態/送出/loading/success/error）
  index.js                 統一輸出入口（TASK1.116新增getHealthInsightClientScript匯出）
```

對應TASK1.116新增的真實route/controller（在這個目錄之外）：

```
src/controllers/health_insight_controller.js   GET頁面/POST送出的橋接邏輯
src/routes/health_insight_routes.js            GET /health-insight、POST /api/health-insight
```

## 元件責任（Intelligence Boundary）

延續TASK1.110/1.113已確認的UI/Intelligence責任分工：

- **UI responsibility（這個目錄）**：collect user
  interaction、display product output、handle user
  experience。
- **Intelligence responsibility（既有`src/intelligence/`）**：
  analysis、recommendation、insight generation。

**這個目錄底下沒有任何一個檔案import
`src/intelligence/`底下的任何東西**——所有元件都是純函式：
接收已經算好的資料（`{type, value}`這類已經過Health Insight
Integration/Feature處理過的安全形狀），回傳HTML字串，不做任何
分析/推論/計算（唯一的例外是`health_summary_card.js`讀取陣列
`.length`這種純結構性計數，不是分析）。

## Output Boundary（延續TASK1.108）

所有元件只讀取TASK1.108/1.111/1.112既有輸出形狀裡**已經被
過濾過**的欄位（`type`/`value`），完全不接觸、也沒有能力顯示
`source`/`status`/`capability`/`feature`這類Runtime
metadata/internal capability structure欄位——因為這些欄位
在傳入UI層之前，已經被Health Insight Feature Result
Mapper（TASK1.111）過濾掉了。

## Error Presentation

`components/error_card.js`把既有的結構化失敗結果（`{ok:false,
reason, field?, stage?}`）分類成四種使用者可見錯誤類別（Missing
data/Invalid input/Unavailable intelligence/Temporary
failure），只顯示分類後的友善訊息，完全不暴露原始`reason`/
`field`/`stage`/例外物件本身。

## Responsive Preparation

`design_system/design_tokens.js`的`getDesignSystemCSS()`包含
tablet（680px）跟desktop（1024px）兩個斷點的媒體查詢，基礎
排版不是只針對單一螢幕尺寸優化。

## Asset Boundary

`assets/asset_registry.js`定義語意化插畫插槽（例如`greeting`/
`observation`），TASK1.115後每個插槽對應`assets/
illustrations/`底下一個真實的`.webp`檔案（使用者提供的參考圖
裁切/去背/壓縮而成，不是AI生成），透過`getAssetUrl(key)`/
`getAssetAlt(key)`存取。`ASSET_BASE_PATH`目前只是**約定路徑**
（`/assets/health-insight/illustrations/`），本次任務沒有建立
任何route去真正伺服這個路徑——未來要嘛把這個路徑接上真正的
靜態資產伺服機制，要嘛在接上路由的任務裡調整這個常數，元件
程式碼本身完全不需要改動。

## TASK1.116更新：Product Activation（第一次真正接線）

TASK1.114/1.115建立的是"純樣式、未接線"的UI Foundation。
TASK1.116第一次把這個目錄接上真正的route/controller：新增
`src/controllers/health_insight_controller.js`（把Input
Experience答案透過既有`createInsightContextBuilder()`
（TASK1.42純函式，不接受db）轉成Insight Context，呼叫既有
`createHealthInsightProductIntegration().requestProductEntry()`
（TASK1.112，完全沒有被修改），把結果交給這個目錄既有的
`renderHealthInsightDashboard()`/`renderHealthInsightDashboardError()`
排版）跟`src/routes/health_insight_routes.js`（`GET
/health-insight`頁面入口＋`POST /api/health-insight`
API），並新增`client/interaction_script.js`（瀏覽器端純字串
腳本——chip選取/輸入狀態管理/送出/loading/success/error
狀態），第一次讓`data-field`/`data-hi-action`這些既有標記
真正綁定事件監聽。這個目錄本身完全沒有反向import任何
route/controller，元件/頁面組裝函式本身也完全沒有被重新設計
（design_tokens.js只新增互動狀態CSS：`.hi-chip--selected`/
`.hi-primary-button--loading`）。

## Current Limitations（目前限制）

- **behaviorPattern/progressTrend固定顯示預留卡片**：延續
  TASK1.111/1.113已確認的"V1不產生實際內容"既有結論，
  TASK1.116沒有新增任何Intelligence邏輯，這個限制依然存在。
- **Observation/Recommendation目前是"一張卡+精簡清單"，還不是
  "一句彙整敘述"**：延續TASK1.115已經確認的既有限制，
  `DESIGN_SPECIFICATION.md`第7節提到的"彙整成一句自然語言
  敘述"這類文字生成邏輯依然留給未來任務評估（避免在UI/Route
  層引入近似NLG的邏輯）。
- **`ASSET_BASE_PATH`依然只是約定路徑，沒有接上真正的靜態
  檔案伺服機制**：TASK1.116沒有新增任何static asset route，
  插畫`<img>`標籤的`src`目前無法真的在瀏覽器載入圖片（Dashboard
  的排版/互動邏輯不受影響），留給未來任務接上。
- **Input Experience只收集使用者當下填寫的輪廓答案，不查詢/
  不寫入任何既有domain資料表**：延續本次任務"D1 domain tables
  維持0筆"的驗證要求，五個`xxxContext`固定是`{count:0,
  items:[]}`，這代表目前不同使用者填寫不同答案，Analysis/
  Recommendation產出的內容目前完全相同（延續V1既有限制，不是
  TASK1.116的回歸）。
- **GET /health-insight、POST /api/health-insight刻意不要求
  登入**：Health Insight Product Integration本身明確設計成
  不接受auth依賴，這兩條路由也沒有掛`requireAuth()`，延續
  "低壓力、不製造使用門檻"既有設計原則。
